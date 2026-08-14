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

const puedeFacturar = requireRol("developer", "gerencia", "oficina");

const REGIMEN_MAP = {
  "601": "general_ley_personas_morales",
  "603": "personas_morales_fines_no_lucrativos",
  "605": "sueldos_salarios",
  "606": "arrendamiento",
  "608": "demas_ingresos",
  "610": "residentes_extranjero",
  "611": "ingresos_dividendos",
  "612": "personas_fisicas_actividades_empresariales",
  "614": "ingresos_intereses",
  "616": "sin_obligaciones_fiscales",
  "620": "sociedades_cooperativas",
  "621": "incorporacion_fiscal",
  "622": "actividades_agricolas",
  "623": "opcional_grupos_sociedades",
  "624": "coordinados",
  "625": "actividades_empresariales_plataformas",
  "626": "simplificado_confianza",
};

const USO_CFDI_MAP = {
  "G01": "adquisicion_mercancias",
  "G02": "devolucion_desc_bonif",
  "G03": "gastos",
  "I01": "construcciones",
  "I02": "mobilario",
  "I03": "equipo_transporte",
  "I04": "equipo_computo",
  "I05": "herramientas",
  "I06": "comunicaciones_telefonicas",
  "I07": "comunicaciones_satelitales",
  "I08": "otra_maquinaria",
  "D01": "gastos_medicos",
  "D02": "gastos_medicos_incapacidad",
  "D03": "gastos_funerales",
  "D04": "donativos",
  "D05": "intereses_hipotecarios",
  "D06": "aportaciones_sar",
  "D07": "primas_seguro_gastos_medicos",
  "D08": "gastos_transportacion_escolar",
  "D09": "depositos_ahorro",
  "D10": "colegiaturas",
  "P01": "por_definir",
  "S01": "sin_efectos_fiscales",
  "CP01": "pagos",
  "CN01": "nomina",
};

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

// ── Helper: normalizar régimen y uso CFDI ──
function normalizarRegimen(valor) {
  if (!valor) return "general_ley_personas_morales";
  // Extraer clave numérica del formato "(601) Texto..."
  const match = valor.match(/\((\d+)\)/);
  if (match) return REGIMEN_MAP[match[1]] ?? "general_ley_personas_morales";
  // Si ya es valor texto EF
  if (Object.values(REGIMEN_MAP).includes(valor)) return valor;
  // Si es clave numérica directa
  if (REGIMEN_MAP[valor]) return REGIMEN_MAP[valor];
  return "general_ley_personas_morales";
}

function normalizarUsoCfdi(valor) {
  if (!valor) return "gastos";
  // Extraer clave del formato "(G03) Texto..."
  const match = valor.match(/\(([A-Z0-9]+)\)/);
  if (match) return USO_CFDI_MAP[match[1]] ?? "gastos";
  // Si ya es valor texto EF
  if (Object.values(USO_CFDI_MAP).includes(valor)) return valor;
  // Si es clave directa
  if (USO_CFDI_MAP[valor]) return USO_CFDI_MAP[valor];
  return "gastos";
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
      regimenFiscal: c.regimenFiscal ?? "601",
      usoCfdi:       c.usoCFDI       ?? "G03",
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
      claveSAT, claveUnidad: claveUnidad || "E48", unidad: unidad || "Unidad de servicio", descripcion,
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

    // LOG TEMPORAL
    console.log("RECEPTOR RECIBIDO:", JSON.stringify(receptor, null, 2));

    if (!receptor?.rfc || !receptor?.nombre || !partidas?.length) {
      return res.status(400).json({ message: "Faltan datos obligatorios: receptor y partidas" });
    }

    const regimenMapeado = normalizarRegimen(receptor.regimenFiscal);
    const usoCfdiMapeado = normalizarUsoCfdi(receptor.usoCfdi);

    console.log("REGIMEN MAPEADO:", regimenMapeado);
    console.log("USO CFDI MAPEADO:", usoCfdiMapeado);

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
        modo:         "debug",
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
          ...(condicionesPago ? { condicionesDePago: condicionesPago } : {}),
          ...(fechaVencimiento ? { fechaVencimiento } : {}),
        },
        Receptor: {
          rfc:             receptor.rfc,
          nombre:          receptor.nombre.toUpperCase(),
          regimenFiscal:   "601",
          usoCfdi:         usoCfdiMapeado,
          DomicilioFiscal: { cp: receptor.cp ?? "45235" },
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

    console.log("BODY EF:", JSON.stringify(body, null, 2));

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
        regimenFiscal: receptor.regimenFiscal ?? "601",
        usoCfdi:       receptor.usoCfdi ?? "G03",
        cp:            receptor.cp ?? "45235",
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

    const fecha = fechaPago
      ? new Date(fechaPago).toISOString().replace("T", " ").slice(0, 19)
      : new Date().toISOString().replace("T", " ").slice(0, 19);

    const folioRep      = `RPA-${Date.now()}`;
    const monto         = parseFloat(montoPagado.toFixed(2));
    const saldoAnterior = parseFloat((factura.total - factura.totalPagado).toFixed(2));
    const saldoInsoluto = parseFloat(Math.max(0, saldoAnterior - monto).toFixed(2));

    const regimenMapeado = normalizarRegimen(factura.receptor.regimenFiscal);

    const body = {
      CFDi: {
        versionCFDi:  "4.0",
        versionEF:    "6.5",
        modo:         "debug",
        serie:        "RPA",
        folioInterno: folioRep,
        fechaEmision: fecha,
        subTotal:     "0",
        total:        "0",
        rfc:          EF_RFC,
        exportacion:  "01",
        DatosDePago:  { metodoDePago: "PUE", formaDePago: "por_definir" },
        Receptor: {
          rfc:             factura.receptor.rfc,
          nombre:          factura.receptor.nombre,
          regimenFiscal:   regimenMapeado,
          usoCfdi:         "pagos",
          DomicilioFiscal: { cp: factura.receptor.cp },
        },
        Partidas: [{
          cantidad:         "1",
          claveUnidad:      "ACT",
          claveProdServ:    "84111506",
          descripcion:      "Pago",
          valorUnitario:    "0",
          importe:          "0",
          objetoDeImpuesto: "01",
        }],
        complemento: {
          Pago20: {
            Totales: { montoTotalPagos: monto.toFixed(2) },
            Pagos: [{
              fechaPago:   fecha,
              formaDePago: formaPago,
              moneda:      factura.moneda ?? "MXN",
              monto:       monto.toFixed(2),
              ...(referenciaBancaria ? { referenciaBancaria } : {}),
              DocumentosRelacionados: [{
                uuid:                 factura.uuid,
                serie:                factura.serie,
                folio:                factura.folio.replace(`${factura.serie}-`, ""),
                moneda:               factura.moneda ?? "MXN",
                metodoPago:           "PPD",
                numParcialidad:       String(factura.totalPagado > 0 ? 2 : 1),
                importeSaldoAnterior: saldoAnterior.toFixed(2),
                importePagado:        monto.toFixed(2),
                importeSaldoInsoluto: saldoInsoluto.toFixed(2),
                objetoDeImpuesto:     "02",
                Impuestos: {
                  Traslados: [{
                    base:       parseFloat((monto / 1.16).toFixed(2)).toFixed(2),
                    impuesto:   "IVA",
                    tipoFactor: "tasa",
                    tasaOCuota: "0.16",
                    importe:    parseFloat((monto - monto / 1.16).toFixed(2)).toFixed(2),
                  }],
                },
              }],
            }],
          },
        },
      },
    };

    const efRes = await llamarEF("generarCfdi", body);

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
      folio:       `RPA-${ack.folioInterno}`,
      serie:       "RPA",
      uuid:        ack.folioFiscalUUID,
      tipo:        "rep",
      estatus:     "vigente",
      moneda:      factura.moneda ?? "MXN",
      subtotal:    0,
      total:       monto,
      totalPagado: monto,
      receptor:    factura.receptor,
      metodoPago:  "PUE",
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
    const { motivo = "02", uuidSustitucion } = req.body;
    const factura = await Factura.findById(req.params.id);
    if (!factura) return res.status(404).json({ message: "Factura no encontrada" });
    if (factura.estatus === "cancelada") return res.status(400).json({ message: "Ya está cancelada" });

    const body = {
      Cancelacion: {
        modo:   "debug",
        rfc:    EF_RFC,
        uuid:   factura.uuid,
        motivo,
        ...(motivo === "01" && uuidSustitucion ? { folioSustitucion: uuidSustitucion } : {}),
      },
    };

    const efRes = await llamarEF("cancelarCfdi", body);
    const ack   = efRes.AckEnlaceFiscal;

    if (!["aceptado", "solicitud_enviada"].includes(ack?.estatusDocumento)) {
      console.error("EF ERROR CANCELAR:", JSON.stringify(efRes, null, 2));
      return res.status(400).json({ message: ack?.mensajeError?.descripcionError ?? "Error al cancelar", detalle: efRes });
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

    const body = {
      EnviarCFDI: {
        modo:    "debug",
        rfc:     EF_RFC,
        uuid:    factura.uuid,
        Correos: [email],
      },
    };

    const efRes = await llamarEF("enviarCfdi", body);
    res.json({ ok: true, efRes });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;