import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import Factura from "../models/Factura.js";
import ProductoFiscal from "../models/ProductoFiscal.js";

const router = Router();

const EF_URL     = "https://api.enlacefiscal.com/v6";
const EF_RFC     = process.env.EF_RFC     ?? "";
const EF_USER    = process.env.EF_USER    ?? "";
const EF_TOKEN   = process.env.EF_TOKEN   ?? "";
const EF_API_KEY = process.env.EF_API_KEY ?? "";

// ── Modo: "debug" para pruebas, cambiar a process.env.EF_MODO cuando vayan a producción ──
const EF_MODO = "debug";

const puedeFacturar = requireRol("developer", "gerencia", "oficina");

// ── Catálogo SAT — se envían las claves directamente a Enlace Fiscal ──
const REGIMENES_VALIDOS = new Set([
  "601", "603", "605", "606", "607", "608",
  "610", "611", "612", "614", "615", "616",
  "620", "621", "622", "623", "624", "625", "626",
]);

const USOS_CFDI_VALIDOS = new Set([
  "G01", "G02", "G03",
  "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08",
  "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10",
  "S01", "CP01", "CN01",
]);

async function llamarEF(endpoint, body) {
  const credentials = Buffer.from(`${EF_USER}:${EF_TOKEN}`).toString("base64");
  const res = await fetch(`${EF_URL}/${endpoint}`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "x-api-key":     EF_API_KEY,
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function llamarEFRep(body) {
  const credentials = Buffer.from(`${EF_USER}:${EF_TOKEN}`).toString("base64");
  const res = await fetch("https://api.enlacefiscal.com/v6/generarReciboElectronicoPago", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "x-api-key":     EF_API_KEY,
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function construirPartidas(partidas) {
  return partidas.map(p => {
    const importe    = parseFloat((p.cantidad * p.valorUnitario).toFixed(2));
    const descuento  = parseFloat((p.descuento ?? 0).toFixed(2));
    const base       = parseFloat((importe - descuento).toFixed(2));
    const importeIva = parseFloat((base * 0.16).toFixed(2));
    return {
      cantidad:         String(p.cantidad),
      claveUnidad:      p.claveUnidad   ?? "E48",
      unidad:           p.unidad        ?? "Servicio",
      claveProdServ:    p.claveProdServ ?? "80101500",
      descripcion:      p.descripcion,
      valorUnitario:    p.valorUnitario.toFixed(2),
      importe:          importe.toFixed(2),
      ...(descuento > 0 ? { descuento: descuento.toFixed(2) } : {}),
      objetoDeImpuesto: "02",
      Impuestos: [{
        tipo:          "traslado",
        claveImpuesto: "IVA",
        tipoFactor:    "tasa",
        tasaOCuota:    "0.16",
        baseImpuesto:  base.toFixed(2),
        importe:       importeIva.toFixed(2),
      }],
    };
  });
}

function calcularTotales(partidas) {
  const subtotal   = partidas.reduce((a, p) => a + p.cantidad * p.valorUnitario, 0);
  const descuentos = partidas.reduce((a, p) => a + (p.descuento ?? 0), 0);
  const base       = subtotal - descuentos;
  const iva        = parseFloat((base * 0.16).toFixed(2));
  const total      = parseFloat((base + iva).toFixed(2));
  return {
    subtotal:   parseFloat(subtotal.toFixed(2)),
    descuentos: parseFloat(descuentos.toFixed(2)),
    base:       parseFloat(base.toFixed(2)),
    iva,
    total,
  };
}

// Devuelve la clave SAT de 3 dígitos (ej. "601").
// Acepta: "601", "601 - General de Ley…", "(601)", "601 General…"
// Lanza Error HTTP-400-friendly si el valor es inválido o vacío.
function normalizarRegimen(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) {
    throw new Error("El régimen fiscal del receptor es obligatorio.");
  }
  const match = texto.match(/\b(\d{3})\b/);
  const clave = match?.[1] ?? "";
  if (!REGIMENES_VALIDOS.has(clave)) {
    throw new Error(
      `Régimen fiscal inválido: "${texto}". Selecciona una clave válida del catálogo SAT (ej. 601, 626).`
    );
  }
  return clave;
}

// Devuelve la clave SAT de uso CFDI (ej. "G03").
// Acepta: "G03", "G03 - Gastos…", "(G03)", etc.
// Lanza Error HTTP-400-friendly si el valor es inválido o vacío.
function normalizarUsoCfdi(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) {
    throw new Error("El uso de CFDI del receptor es obligatorio.");
  }
  // Extraer código: letras mayúsculas + dígitos, 2-4 chars
  const match = texto.match(/\b([A-Z]{1,2}\d{2})\b/);
  const clave = match?.[1] ?? texto.toUpperCase();
  if (!USOS_CFDI_VALIDOS.has(clave)) {
    throw new Error(
      `Uso de CFDI inválido: "${texto}". Selecciona una clave válida del catálogo SAT (ej. G03, S01).`
    );
  }
  return clave;
}

// ════════════════════════════════════════
// GET /facturacion
// ════════════════════════════════════════
router.get("/", auth, puedeFacturar, async (req, res) => {
  try {
    const { tipo, estatus, desde, hasta, search } = req.query;
    const filtro = {};
    if (tipo)    filtro.tipo    = tipo;
    if (estatus) filtro.estatus = estatus;
    if (desde || hasta) {
      filtro.fechaEmision = {};
      if (desde) filtro.fechaEmision.$gte = new Date(desde);
      if (hasta) filtro.fechaEmision.$lte = new Date(hasta + "T23:59:59");
    }
    if (search) {
      filtro.$or = [
        { folio:             { $regex: search, $options: "i" } },
        { uuid:              { $regex: search, $options: "i" } },
        { "receptor.nombre": { $regex: search, $options: "i" } },
        { "receptor.rfc":    { $regex: search, $options: "i" } },
      ];
    }
    const facturas = await Factura.find(filtro)
      .populate("clientePipsa", "nombre")
      .populate("creadoPor", "nombre")
      .sort({ createdAt: -1 })
      .limit(200);
    res.json(facturas);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// GET /facturacion/clientes/buscar
// ════════════════════════════════════════
router.get("/clientes/buscar", auth, puedeFacturar, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const Cliente = (await import("../models/Cliente.js")).default;
    const clientes = await Cliente.find({
      $or: [
        { nombre:      { $regex: q, $options: "i" } },
        { rfc:         { $regex: q, $options: "i" } },
        { razonSocial: { $regex: q, $options: "i" } },
        { contacto:    { $regex: q, $options: "i" } },
      ],
      estatus: "activo",
    }).select("nombre razonSocial rfc regimenFiscal usoCFDI codigoPostal email emailFiscal").limit(10);

    res.json(clientes.map(c => ({
      rfc:           c.rfc           ?? "",
      nombreFiscal:  c.razonSocial   ?? c.nombre ?? "",
      regimenFiscal: c.regimenFiscal ?? "",
      usoCfdi:       c.usoCFDI       ?? "",
      cp:            c.codigoPostal  ?? "",
      email:         c.emailFiscal   ?? c.email ?? "",
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// ════════════════════════════════════════
// GET /facturacion/productos
// ════════════════════════════════════════
router.get("/productos", auth, puedeFacturar, async (req, res) => {
  try {
    const { q } = req.query;
    const filtro = { activo: true };
    if (q && q.length >= 1) {
      filtro.$or = [
        { descripcion: { $regex: q, $options: "i" } },
        { claveSAT:    { $regex: q, $options: "i" } },
      ];
    }
    const productos = await ProductoFiscal.find(filtro).sort({ descripcion: 1 }).limit(50);
    res.json(productos);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// POST /facturacion/productos
// ════════════════════════════════════════
router.post("/productos", auth, requireRol("developer", "gerencia"), async (req, res) => {
  try {
    const { claveSAT, claveUnidad, unidad, descripcion } = req.body;
    if (!claveSAT || !descripcion) {
      return res.status(400).json({ message: "Clave SAT y descripción son requeridas" });
    }
    const producto = await ProductoFiscal.create({
      claveSAT,
      claveUnidad: claveUnidad || "E48",
      unidad:      unidad      || "Unidad de servicio",
      descripcion,
    });
    res.status(201).json(producto);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// PUT /facturacion/productos/:id
// ════════════════════════════════════════
router.put("/productos/:id", auth, requireRol("developer", "gerencia"), async (req, res) => {
  try {
    const producto = await ProductoFiscal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!producto) return res.status(404).json({ message: "No encontrado" });
    res.json(producto);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// DELETE /facturacion/productos/:id
// ════════════════════════════════════════
router.delete("/productos/:id", auth, requireRol("developer", "gerencia"), async (req, res) => {
  try {
    await ProductoFiscal.findByIdAndUpdate(req.params.id, { activo: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// POST /facturacion/timbrar
// ════════════════════════════════════════
router.post("/timbrar", auth, puedeFacturar, async (req, res) => {
  try {
    const {
      serie = "MA", folioInterno, fechaEmision,
      receptor, partidas, metodoPago = "PUE", formaPago = "03",
      condicionesPago, fechaVencimiento, moneda = "MXN", tipoCambio,
      notas, clientePipsaId,
    } = req.body;



    if (!receptor?.rfc || !receptor?.nombre || !partidas?.length) {
      return res.status(400).json({ message: "Faltan datos obligatorios: receptor y partidas" });
    }

    // ── FIX 1: Validar CP obligatorio ──────────────────────────
    if (!receptor.cp) {
      return res.status(400).json({ message: "El código postal fiscal del receptor es obligatorio" });
    }

    // ── Normalizar régimen y uso CFDI — devuelve clave SAT directa ──
    let regimenMapeado, usoCfdiMapeado;
    try {
      regimenMapeado = normalizarRegimen(receptor.regimenFiscal);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }
    try {
      usoCfdiMapeado = normalizarUsoCfdi(receptor.usoCfdi);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    // Log sanitizado — sin token, sin API key, sin datos personales completos
    const ocultarRfc = (rfc) => rfc ? rfc.slice(0, 4) + "****" : "—";
    console.log("RECEPTOR EF:", {
      rfc:           ocultarRfc(receptor.rfc),
      regimenFiscal: regimenMapeado,
      usoCfdi:       usoCfdiMapeado,
      cp:            receptor.cp,
    });

    const { subtotal, descuentos, base, iva, total } = calcularTotales(partidas);
    const partidasEF = construirPartidas(partidas);

    const folio = folioInterno ?? `${Date.now()}`;
    const fecha = fechaEmision
      ? new Date(fechaEmision).toISOString().replace("T", " ").slice(0, 19)
      : new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

    const body = {
      CFDi: {
        versionCFDi:  "4.0",
        versionEF:    "6.5",
        modo:         EF_MODO,
        serie,
        folioInterno: String(folio),
        fechaEmision: fecha,
        subTotal:     subtotal.toFixed(2),
        total:        total.toFixed(2),
        tipoMoneda:   moneda,
        rfc:          EF_RFC,
        exportacion:  "01",
        ...(descuentos > 0 ? { descuentos: descuentos.toFixed(2) } : {}),
        ...(moneda !== "MXN" && tipoCambio ? { tipoCambio: String(tipoCambio) } : {}),
        DatosDePago: {
          metodoDePago: metodoPago,
          formaDePago:  formaPago,
          ...(condicionesPago   ? { condicionesDePago: condicionesPago } : {}),
          ...(fechaVencimiento  ? { fechaVencimiento }                  : {}),
        },
        Receptor: {
          rfc:             receptor.rfc,
          nombre:          receptor.nombre.toUpperCase(),
          regimenFiscal:   regimenMapeado,   // ── FIX 2 aplicado ──
          usoCfdi:         usoCfdiMapeado,
          DomicilioFiscal: { cp: receptor.cp }, // ── FIX 1 aplicado (sin fallback) ──
        },
        Partidas: partidasEF,
        Impuestos: {
          Totales:   { traslados: iva.toFixed(2) },
          Impuestos: [{
            tipo:          "traslado",
            claveImpuesto: "IVA",
            tipoFactor:    "tasa",
            tasaOCuota:    "0.16",
            baseImpuesto:  base.toFixed(2),
            importe:       iva.toFixed(2),
          }],
        },
        ...(notas ? {
          BloquesInfoAdicional: {
            BloqueInferior: { titulo: "Notas", texto: notas },
          },
        } : {}),
        ...(receptor.email ? {
          EnviarCFDI: { Correos: [receptor.email] },
        } : {}),
      },
    };



    const efRes = await llamarEF("generarCfdi", body);

    if (efRes.AckEnlaceFiscal?.estatusDocumento !== "aceptado") {
      console.error("EF ERROR:", JSON.stringify(efRes, null, 2));
      return res.status(400).json({
        message: efRes?.AckEnlaceFiscal?.mensajeError?.descripcionError ?? efRes?.mensaje ?? "Error al timbrar",
        detalle: efRes,
      });
    }

    const ack = efRes.AckEnlaceFiscal;

    const factura = await Factura.create({
      folio:           `${serie}-${ack.folioInterno}`,
      serie,
      uuid:            ack.folioFiscalUUID,
      tipo:            "factura",
      estatus:         "vigente",
      estatusPago:     "sin_pago",
      moneda,
      tipoCambio:      tipoCambio ?? null,
      subtotal,
      descuentos,
      total,
      totalPagado:     0,
      receptor: {
        rfc:           receptor.rfc,
        nombre:        receptor.nombre.toUpperCase(),
        regimenFiscal: regimenMapeado,
        usoCfdi:       usoCfdiMapeado,
        cp:            receptor.cp,
      },
      metodoPago,
      formaPago,
      condicionesPago:  condicionesPago ?? "",
      fechaEmision:     new Date(fecha),
      fechaVencimiento: fechaVencimiento ? new Date(fechaVencimiento) : null,
      partidas,
      urlPdf:  ack.descargaArchivoPDF ?? null,
      urlXml:  ack.descargaXmlCFDi   ?? null,
      urlQr:   ack.descargaArchivoQR  ?? null,
      notas:   notas ?? "",
      clientePipsa: clientePipsaId ?? null,
      creadoPor:    req.userId,
    });

    res.status(201).json({ factura, ack });
  } catch (e) {
    console.error("Error timbrar:", e);
    res.status(500).json({ message: e.message });
  }
});

// ════════════════════════════════════════
// POST /facturacion/rep
// ════════════════════════════════════════
router.post("/rep", auth, puedeFacturar, async (req, res) => {
  try {
    const {
      facturaId, montoPagado, formaPago = "03",
      fechaPago, referenciaBancaria, notas,
    } = req.body;

    const factura = await Factura.findById(facturaId);
    if (!factura) return res.status(404).json({ message: "Factura no encontrada" });
    if (factura.estatus === "cancelada") return res.status(400).json({ message: "La factura está cancelada" });

    // ── FIX 3: Validar que no exceda el saldo pendiente ────────
    const saldoPendiente = parseFloat((factura.total - factura.totalPagado).toFixed(2));
    if (montoPagado > saldoPendiente + 0.01) {
      return res.status(400).json({
        message: `El monto ($${montoPagado}) excede el saldo pendiente ($${saldoPendiente})`,
      });
    }

    // ── FIX 4: Validar que sea factura PPD ─────────────────────
    if (factura.metodoPago !== "PPD") {
      return res.status(400).json({ message: "Solo se puede emitir REP para facturas con método de pago PPD" });
    }

    const fecha = fechaPago
      ? new Date(fechaPago).toISOString().replace("T", " ").slice(0, 19)
      : new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

    const folioNumerico  = Date.now() % 1000000;
    const monto          = parseFloat(montoPagado.toFixed(2));
    const saldoAnterior  = saldoPendiente;
    const saldoInsoluto  = parseFloat(Math.max(0, saldoAnterior - monto).toFixed(2));
    const base           = parseFloat((monto / 1.16).toFixed(2));
    const importeIva     = parseFloat((monto - base).toFixed(2));

    // ── FIX 5: Parcialidad correcta ────────────────────────────
    const repsPrevios = await Factura.countDocuments({
      tipo:               "rep",
      facturaRelacionada: facturaId,
      estatus:            { $ne: "cancelada" },
    });
    const numParcialidad = repsPrevios + 1;

    // Validar régimen antes de construir el body del REP
    let regimenRep;
    try {
      regimenRep = normalizarRegimen(factura.receptor.regimenFiscal);
    } catch (e) {
      return res.status(400).json({ message: e.message });
    }

    const body = {
      CFDi: {
        versionCFDi:  "4.0",
        versionEF:    "6.5",
        modo:         EF_MODO,
        serie:        "RPA",
        folioInterno: folioNumerico,
        fechaEmision: fecha,
        rfc:          EF_RFC,
        Receptor: {
          rfc:             factura.receptor.rfc,
          nombre:          factura.receptor.nombre,
          regimenFiscal:   regimenRep, // clave SAT directa (ej. "601")
          usoCfdi:         "CP01", // uso fijo para complemento de pago
          DomicilioFiscal: { cp: factura.receptor.cp },
        },
        ComplementoPago: [{
          Totales: {
            montoTotalPagos:        monto.toFixed(2),
            trasladosBaseIVA16:     base.toFixed(2),
            trasladosImpuestoIVA16: importeIva.toFixed(2),
          },
          Pago: [{
            fechaPago:   fecha,
            formaDePago: formaPago,
            tipoMoneda:  factura.moneda ?? "MXN",
            tipoCambio:  "1",
            monto:       monto.toFixed(2),
            ...(referenciaBancaria ? { numeroOperacion: referenciaBancaria } : {}),
            DocumentosRelacionados: [{
              idDocumento:       factura.uuid,
              serie:             factura.serie,
              folioInterno:      factura.folio.replace(`${factura.serie}-`, ""),
              tipoMoneda:        factura.moneda ?? "MXN",
              equivalencia:      "1",
              numParcialidad:    String(numParcialidad), // ── FIX 5 aplicado ──
              saldoAnterior:     saldoAnterior.toFixed(2),
              importePagado:     monto.toFixed(2),
              impoSaldoInsoluto: saldoInsoluto.toFixed(2),
              objetoDeImpuesto:  "02",
              Impuestos: [{
                tipo:          "traslado",
                claveImpuesto: "IVA",
                tipoFactor:    "tasa",
                tasaOCuota:    "0.16",
                importe:       importeIva.toFixed(2),
                baseImpuesto:  base.toFixed(2),
              }],
            }],
            Impuestos: [{
              tipo:          "traslado",
              claveImpuesto: "IVA",
              tipoFactor:    "tasa",
              tasaOCuota:    "0.16",
              importe:       importeIva.toFixed(2),
              baseImpuesto:  base.toFixed(2),
            }],
          }],
        }],
      },
    };

    console.log("BODY REP:", JSON.stringify(body, null, 2));

    const efRes = await llamarEFRep(body);

    if (efRes.AckEnlaceFiscal?.estatusDocumento !== "aceptado") {
      console.error("EF ERROR REP:", JSON.stringify(efRes, null, 2));
      return res.status(400).json({
        message: efRes?.AckEnlaceFiscal?.mensajeError?.descripcionError ?? "Error al timbrar REP",
        detalle: efRes,
      });
    }

    const ack = efRes.AckEnlaceFiscal;

    const nuevoTotalPagado = parseFloat((factura.totalPagado + monto).toFixed(2));
    const nuevoEstatus     = nuevoTotalPagado >= factura.total ? "pagada" : "parcial";
    await Factura.findByIdAndUpdate(facturaId, {
      totalPagado: nuevoTotalPagado,
      estatusPago: nuevoEstatus,
    });

    const rep = await Factura.create({
      folio:              `RPA-${ack.folioInterno}`,
      serie:              "RPA",
      uuid:               ack.folioFiscalUUID,
      tipo:               "rep",
      estatus:            "vigente",
      moneda:             factura.moneda ?? "MXN",
      subtotal:           0,
      total:              monto,
      totalPagado:        monto,
      receptor:           factura.receptor,
      metodoPago:         "PUE",
      formaPago,
      fechaEmision:       new Date(fecha),
      urlPdf:             ack.descargaArchivoPDF ?? null,
      urlXml:             ack.descargaXmlCFDi   ?? null,
      urlQr:              ack.descargaArchivoQR  ?? null,
      notas:              notas ?? "",
      facturaRelacionada: facturaId,
      clientePipsa:       factura.clientePipsa,
      creadoPor:          req.userId,
    });

    res.status(201).json({ rep, ack });
  } catch (e) {
    console.error("Error REP:", e);
    res.status(500).json({ message: e.message });
  }
});

// ════════════════════════════════════════
// POST /facturacion/:id/cancelar
// ════════════════════════════════════════
router.post("/:id/cancelar", auth, puedeFacturar, async (req, res) => {
  try {
    const { motivo = "03", justificacion, uuidSustitucion } = req.body;
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: "Factura no encontrada" });
    if (factura.estatus === "cancelada") return res.status(400).json({ message: "Ya está cancelada" });

    const folioNumerico = parseInt(factura.folio?.replace(`${factura.serie}-`, "") ?? factura.folio, 10);

    const body = {
      Solicitud: {
        modo:   EF_MODO,
        rfc:    EF_RFC,
        accion: "cancelarCfdi",
        CFDi: {
          serie:  factura.serie ?? "MA",
          folio:  folioNumerico,
          ...(justificacion ? { justificacion } : {}),
          motivo,
          ...(motivo === "01" && uuidSustitucion ? {
            ComprobanteSustitucion: {
              serie: factura.serie ?? "MA",
              folio: uuidSustitucion, // ── FIX: no convertir UUID a número ──
            },
          } : {}),
        },
      },
    };

    console.log("BODY CANCELAR:", JSON.stringify(body, null, 2));

    const efRes = await llamarEF("cancelarCfdi", body);
    const ack   = efRes.AckEnlaceFiscal;

    console.log("EF CANCELAR RESPONSE:", JSON.stringify(efRes, null, 2));

    if (!["aceptado"].includes(ack?.estatusDocumento)) {
      return res.status(400).json({
        message: ack?.mensajeError?.descripcionError ?? "Error al cancelar",
        detalle: efRes,
      });
    }

    // ── FIX 6: Si es un REP, revertir el pago en la factura original ──
    if (factura.tipo === "rep" && factura.facturaRelacionada) {
      const facturaOriginal = await Factura.findById(factura.facturaRelacionada);
      if (facturaOriginal) {
        const nuevoTotal   = parseFloat(Math.max(0, facturaOriginal.totalPagado - factura.total).toFixed(2));
        const nuevoEstatus = nuevoTotal <= 0
          ? "sin_pago"
          : nuevoTotal >= facturaOriginal.total
            ? "pagada"
            : "parcial";
        await Factura.findByIdAndUpdate(factura.facturaRelacionada, {
          totalPagado: nuevoTotal,
          estatusPago: nuevoEstatus,
        });
      }
    }

    await Factura.findByIdAndUpdate(req.params.id, { estatus: "cancelada" });
    res.json({ ok: true, ack });
  } catch (e) {
    console.error("Error cancelar:", e);
    res.status(500).json({ message: e.message });
  }
});

// ════════════════════════════════════════
// GET /facturacion/:id
// ════════════════════════════════════════
router.get("/:id", auth, puedeFacturar, async (req, res) => {
  try {
    const factura = await Factura.findById(req.params.id)
      .populate("clientePipsa", "nombre")
      .populate("creadoPor", "nombre")
      .populate("facturaRelacionada", "folio uuid total");
    if (!factura) return res.status(404).json({ message: "No encontrada" });
    res.json(factura);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// POST /facturacion/:id/enviar-correo
// ════════════════════════════════════════
router.post("/:id/enviar-correo", auth, puedeFacturar, async (req, res) => {
  try {
    const { email } = req.body;
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: "No encontrada" });

    if (!email) return res.status(400).json({ message: "El correo es obligatorio" });

    const body = {
      EnviarCFDI: {
        modo:    EF_MODO,
        rfc:     EF_RFC,
        uuid:    factura.uuid,
        Correos: [email],
      },
    };

    const efRes = await llamarEF("enviarCfdi", body);

    // ── FIX 7: Validar respuesta antes de declarar ok ──────────
    if (efRes.AckEnlaceFiscal?.estatusDocumento !== "aceptado" && efRes.error) {
      return res.status(400).json({ message: efRes?.mensaje ?? "Error al enviar correo", detalle: efRes });
    }

    res.json({ ok: true, efRes });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;