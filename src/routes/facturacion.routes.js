import { Router } from "express";
import { createHash } from "crypto";
import { auth, requireRol } from "../middleware/auth.js";
import Factura from "../models/Factura.js";
import OperacionRep from "../models/OperacionRep.js";
import ProductoFiscal from "../models/ProductoFiscal.js";

// ── Hash del payload fiscal ────────────────────────────────────────────────
// SHA-256 determinista de los campos que identifican unívocamente el pago:
// facturaId + monto (2 decimales fijos) + fechaPago (YYYY-MM-DD) + formaPago + moneda.
// Se guarda al crear la OperacionRep y se valida si la misma clave llega con datos distintos.
function hashPayload(facturaId, monto, fechaPago, formaPago, moneda = "MXN") {
  const fechaDia = String(fechaPago ?? "").slice(0, 10); // solo YYYY-MM-DD
  const raw = [facturaId, parseFloat(monto).toFixed(2), fechaDia, formaPago, moneda].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

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

// ────────────────────────────────────────────────────────────────
//  Helpers de fecha — zona horaria America/Mexico_City
//
//  El frontend envía fechas de dos formas:
//    A) "YYYY-MM-DD" — input type="date", solo calendario, sin hora.
//       new Date("YYYY-MM-DD") → medianoche UTC → en México = día anterior.
//       Solución: mediodía UTC para que el día sea siempre correcto.
//    B) ISO completo con hora real — se respeta convertida a México.
//
//  fechaParaEF(valor, tipo, techo):
//    Devuelve "YYYY-MM-DD HH:MM:SS" para Enlace Fiscal.
//    tipo = "emision" → hora actual si no hay valor.
//    tipo = "pago"    → mediodía si solo hay fecha; nunca > techo.
//
//  fechaParaMongo(valor):
//    Date que preserva el día calendario en cualquier TZ del servidor.
// ────────────────────────────────────────────────────────────────

/** Hora actual en México como "YYYY-MM-DD HH:MM:SS" */
function ahoraEnMexico() {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/Mexico_City",
  }).replace("T", " ").slice(0, 19);
}

/** ISO string → "YYYY-MM-DD HH:MM:SS" en hora México */
function isoAMexico(isoStr) {
  return new Date(isoStr).toLocaleString("sv-SE", {
    timeZone: "America/Mexico_City",
  }).replace("T", " ").slice(0, 19);
}

/**
 * Construye el string de fecha para Enlace Fiscal ("YYYY-MM-DD HH:MM:SS").
 * @param {string|null} valor  - "YYYY-MM-DD" | ISO completo | null
 * @param {"emision"|"pago"}   tipo
 * @param {string|null}        techo - fechaEmision del REP; FechaPago no puede superarla
 */
function fechaParaEF(valor, tipo = "emision", techo = null) {
  let resultado;

  if (!valor) {
    resultado = ahoraEnMexico();
  } else {
    const s = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      // Solo fecha calendario: mediodía México (hora neutra, no desplaza el día)
      resultado = `${s} 12:00:00`;
    } else {
      resultado = isoAMexico(s);
    }
  }

  // FechaPago nunca puede ser posterior a fechaEmision del REP
  if (tipo === "pago" && techo && resultado > techo) {
    resultado = techo;
  }

  return resultado;
}

function fechaParaMongo(valor) {
  if (!valor) return new Date();
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    // Mediodía UTC → día correcto en cualquier TZ del servidor
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  return new Date(s);
}

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
    // fechaEmision del CFDI: hora actual México si no se especificó
    const fecha = fechaParaEF(fechaEmision, "emision");

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
      fechaEmision:     fechaParaMongo(fechaEmision),
      fechaVencimiento: fechaVencimiento ? fechaParaMongo(fechaVencimiento) : null,
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
//
//  Protección contra condiciones de carrera:
//
//  A) bloqueoFactura (índice unique+sparse en OperacionRep)
//     Es la ÚNICA protección primaria. Dos peticiones concurrentes con claves
//     distintas intentan crear OperacionRep con el mismo bloqueoFactura.
//     MongoDB solo acepta una; la segunda recibe E11000 y el endpoint devuelve 409.
//     El findOne posterior es solo para producir el mensaje descriptivo.
//
//  B) claveIdempotencia (índice unique en OperacionRep)
//     Dos peticiones idénticas (doble clic, reintento de red con la misma clave)
//     solo crean un documento. La segunda recibe E11000 y lee el estado actual.
//
//  Ciclo de vida de bloqueoFactura:
//     Se establece en el create junto con el facturaId.
//     Se elimina con $unset (no $set:null) al alcanzar timbrado o fallido.
//     En incierto y timbrado_pendiente_aplicacion se conserva (la factura sigue bloqueada).
//
router.post("/rep", auth, puedeFacturar, async (req, res) => {
  const {
    facturaId, montoPagado, formaPago = "03",
    fechaPago, referenciaBancaria, notas,
    claveIdempotencia,
  } = req.body;

  if (!claveIdempotencia || typeof claveIdempotencia !== "string" || claveIdempotencia.length < 16) {
    return res.status(400).json({
      message: "Se requiere claveIdempotencia (UUID generado en el cliente al abrir la operación).",
    });
  }

  // ── 1. Intentar crear OperacionRep con bloqueoFactura ───────────────────
  // Dos intentos simultáneos con claves diferentes: MongoDB acepta solo uno.
  // El perdedor recibe E11000 sobre bloqueoFactura.
  // Un reintento con la misma clave recibe E11000 sobre claveIdempotencia.
  let operacion;
  try {
    const montoNorm  = parseFloat(parseFloat(montoPagado).toFixed(2));
    const facturaMon = (await Factura.findById(facturaId).select("moneda").lean())?.moneda ?? "MXN";
    operacion = await OperacionRep.create({
      bloqueoFactura:     facturaId,         // índice unique+sparse — protección primaria
      claveIdempotencia,                     // índice unique — deduplicación de reintentos
      facturaRelacionada: facturaId,
      monto:              montoNorm,
      fechaPago:          fechaParaMongo(fechaPago),
      formaPago,
      referenciaBancaria: referenciaBancaria || null,
      estado:             "pendiente",
      solicitadoPor:      req.userId,
      payloadHash:        hashPayload(facturaId, montoNorm, fechaPago, formaPago, facturaMon),
    });
  } catch (e) {
    if (e.code !== 11000) {
      console.error("Error creando OperacionRep:", e);
      return res.status(500).json({ message: "Error interno al registrar la operación." });
    }

    // ── E11000: determinar qué índice causó el conflicto ─────────────────
    const esBloqueoFactura    = e.keyPattern?.bloqueoFactura    != null;
    const esClaveIdempotencia = e.keyPattern?.claveIdempotencia != null;

    if (esBloqueoFactura) {
      // Otra operación (clave diferente) ya tiene el bloqueo de esta factura.
      // findOne solo para mensaje descriptivo — no es la protección.
      const activa = await OperacionRep.findOne({
        facturaRelacionada: facturaId,
        estado: { $in: ["pendiente", "procesando", "aplicando", "incierto", "timbrado_pendiente_aplicacion"] },
      }).lean();
      const msgs = {
        pendiente:                    "Existe una operación pendiente de iniciar para esta factura.",
        procesando:                   "Existe una operación en proceso para esta factura. Espera a que termine.",
        aplicando:                    "El registro local del REP está en curso. Espera unos segundos.",
        incierto:                     "Existe un timbrado con resultado incierto. Requiere conciliación manual en el portal de EF.",
        timbrado_pendiente_aplicacion: "Existe un REP ya timbrado que no fue registrado localmente. Usa el endpoint de reaplicación.",
      };
      const msg = activa ? (msgs[activa.estado] ?? "Operación activa para esta factura.") : "Operación activa para esta factura.";
      return res.status(409).json({
        message:     msg,
        estado:      activa?.estado ?? "desconocido",
        operacionId: activa?._id ?? null,
        folioEF:     activa?.folioEF ?? null,
        uuidEF:      activa?.uuidRep ?? null,
      });
    }

    if (esClaveIdempotencia) {
      // Misma clave — leer estado actual del registro existente.
      operacion = await OperacionRep.findOne({ claveIdempotencia });
      if (!operacion) {
        return res.status(500).json({ message: "Error de consistencia interna." });
      }

      // Validar hash del payload para detectar payload diferente con misma clave
      if (operacion.payloadHash) {
        const facturaMon2 = (await Factura.findById(facturaId).select("moneda").lean())?.moneda ?? "MXN";
        const hashEntrante = hashPayload(
          String(facturaId),
          parseFloat(parseFloat(montoPagado).toFixed(2)),
          fechaPago,
          formaPago,
          facturaMon2,
        );
        if (hashEntrante !== operacion.payloadHash) {
          return res.status(409).json({
            message: "La clave de idempotencia ya existe pero el payload fiscal no coincide. Genera una nueva operación.",
            estado:  "payload_mismatch",
          });
        }
      }

      const EXPIRACION_MS = 10 * 60 * 1000;
      switch (operacion.estado) {
        case "timbrado": {
          const repYaTimbrado = await Factura.findOne({ uuid: operacion.uuidRep });
          return res.status(200).json({
            idempotente: true,
            rep:  repYaTimbrado,
            info: `REP ya emitido (${operacion.folioRep}). Se devuelve el resultado original.`,
          });
        }
        case "procesando": {
          const elapsed = Date.now() - (operacion.procesandoDesde?.getTime() ?? 0);
          if (elapsed < EXPIRACION_MS) {
            return res.status(409).json({ message: "Esta operación ya está siendo procesada.", estado: "procesando" });
          }
          await OperacionRep.findByIdAndUpdate(operacion._id, {
            $set:   { estado: "incierto" },
            $unset: { procesandoDesde: 1 },
            // bloqueoFactura se conserva: la factura sigue bloqueada en incierto
          });
          return res.status(409).json({
            message: `Bloqueo expirado. Estado promovido a incierto. Verifica folioEF=${operacion.folioEF ?? "sin folio"} en portal EF.`,
            estado: "incierto", folioEF: operacion.folioEF,
          });
        }
        case "incierto":
          return res.status(409).json({
            message: `Operación incierta. Verifica folioEF=${operacion.folioEF ?? "sin folio"} en portal EF antes de reintentar.`,
            estado: "incierto", folioEF: operacion.folioEF, nota: operacion.nota,
          });
        case "fallido":
          return res.status(409).json({
            message: `Operación fallida: ${operacion.errorMsg ?? "error desconocido"}. Para reintentar abre el modal nuevamente.`,
            estado: "fallido",
          });
        case "timbrado_pendiente_aplicacion":
          return res.status(409).json({
            message: `REP timbrado pendiente de aplicar localmente. Usa POST /facturacion/rep/aplicar/${operacion._id}.`,
            estado: "timbrado_pendiente_aplicacion", operacionId: operacion._id,
          });
        default:
          // pendiente — adquirir normalmente (fluye al paso 2)
          break;
      }
    }

    if (!operacion) return res.status(500).json({ message: "Error interno desconocido." });
  }

  // ── 2. Adquirir bloqueo atómico: pendiente → procesando ─────────────────
  const folioEF = Date.now() % 1000000;
  const adquirida = await OperacionRep.findOneAndUpdate(
    { _id: operacion._id, estado: "pendiente" },
    { $set: { estado: "procesando", procesandoDesde: new Date(), folioEF } },
    { new: true },
  );
  if (!adquirida) {
    return res.status(409).json({ message: "Esta operación ya está siendo procesada." });
  }

  // ── 3. Validaciones de negocio ───────────────────────────────────────────
  let factura;
  try {
    factura = await Factura.findById(facturaId);
    if (!factura) {
      await OperacionRep.findByIdAndUpdate(operacion._id, {
        $set: { estado: "fallido", errorMsg: "Factura no encontrada" },
        $unset: { bloqueoFactura: 1 },
      });
      return res.status(404).json({ message: "Factura no encontrada" });
    }
    if (factura.estatus === "cancelada") {
      await OperacionRep.findByIdAndUpdate(operacion._id, {
        $set: { estado: "fallido", errorMsg: "Factura cancelada" },
        $unset: { bloqueoFactura: 1 },
      });
      return res.status(400).json({ message: "La factura está cancelada" });
    }
    if (factura.metodoPago !== "PPD") {
      await OperacionRep.findByIdAndUpdate(operacion._id, {
        $set: { estado: "fallido", errorMsg: "Factura no es PPD" },
        $unset: { bloqueoFactura: 1 },
      });
      return res.status(400).json({ message: "Solo se puede emitir REP para facturas con método de pago PPD" });
    }
    const saldoPendiente = parseFloat((factura.total - factura.totalPagado).toFixed(2));
    const monto          = parseFloat(parseFloat(montoPagado).toFixed(2));
    if (monto > saldoPendiente + 0.01) {
      await OperacionRep.findByIdAndUpdate(operacion._id, {
        $set: { estado: "fallido", errorMsg: `Monto (${monto}) excede saldo (${saldoPendiente})` },
        $unset: { bloqueoFactura: 1 },
      });
      return res.status(400).json({ message: `El monto ($${monto}) excede el saldo pendiente ($${saldoPendiente})` });
    }
  } catch (e) {
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set: { estado: "fallido", errorMsg: e.message },
      $unset: { bloqueoFactura: 1 },
    });
    return res.status(500).json({ message: e.message });
  }

  // ── 4. Preparar datos para EF ────────────────────────────────────────────
  const monto         = parseFloat(parseFloat(montoPagado).toFixed(2));
  const saldoPendiente = parseFloat((factura.total - factura.totalPagado).toFixed(2));
  const saldoAnterior = saldoPendiente;
  const saldoInsoluto = parseFloat(Math.max(0, saldoAnterior - monto).toFixed(2));
  const base          = parseFloat((monto / 1.16).toFixed(2));
  const importeIva    = parseFloat((monto - base).toFixed(2));

  const repsPrevios = await Factura.countDocuments({
    tipo: "rep", facturaRelacionada: facturaId, estatus: { $ne: "cancelada" },
  });
  const numParcialidad = repsPrevios + 1;

  let regimenRep;
  try {
    regimenRep = normalizarRegimen(factura.receptor.regimenFiscal);
  } catch (e) {
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set: { estado: "fallido", errorMsg: e.message },
      $unset: { bloqueoFactura: 1 },
    });
    return res.status(400).json({ message: e.message });
  }

  const fechaEmisionRep = fechaParaEF(null, "emision");
  const fechaPagoEF     = fechaParaEF(fechaPago, "pago", fechaEmisionRep);

  const bodyEF = {
    CFDi: {
      versionCFDi: "4.0", versionEF: "6.5", modo: EF_MODO,
      serie: "RPA", folioInterno: folioEF, fechaEmision: fechaEmisionRep, rfc: EF_RFC,
      Receptor: {
        rfc: factura.receptor.rfc, nombre: factura.receptor.nombre,
        regimenFiscal: regimenRep, usoCfdi: "CP01",
        DomicilioFiscal: { cp: factura.receptor.cp },
      },
      ComplementoPago: [{
        Totales: {
          montoTotalPagos: monto.toFixed(2),
          trasladosBaseIVA16: base.toFixed(2),
          trasladosImpuestoIVA16: importeIva.toFixed(2),
        },
        Pago: [{
          fechaPago: fechaPagoEF, formaDePago: formaPago,
          tipoMoneda: factura.moneda ?? "MXN", tipoCambio: "1",
          monto: monto.toFixed(2),
          ...(referenciaBancaria ? { numeroOperacion: referenciaBancaria } : {}),
          DocumentosRelacionados: [{
            idDocumento: factura.uuid, serie: factura.serie,
            folioInterno: factura.folio.replace(`${factura.serie}-`, ""),
            tipoMoneda: factura.moneda ?? "MXN", equivalencia: "1",
            numParcialidad: String(numParcialidad),
            saldoAnterior: saldoAnterior.toFixed(2),
            importePagado: monto.toFixed(2),
            impoSaldoInsoluto: saldoInsoluto.toFixed(2),
            objetoDeImpuesto: "02",
            Impuestos: [{ tipo: "traslado", claveImpuesto: "IVA", tipoFactor: "tasa", tasaOCuota: "0.16", importe: importeIva.toFixed(2), baseImpuesto: base.toFixed(2) }],
          }],
          Impuestos: [{ tipo: "traslado", claveImpuesto: "IVA", tipoFactor: "tasa", tasaOCuota: "0.16", importe: importeIva.toFixed(2), baseImpuesto: base.toFixed(2) }],
        }],
      }],
    },
  };

  // ── 5. Llamar a Enlace Fiscal ────────────────────────────────────────────
  let efRes;
  try {
    efRes = await llamarEFRep(bodyEF);
  } catch (e) {
    // Error de red/timeout: no sabemos si EF timbró → incierto.
    // bloqueoFactura se CONSERVA: la factura sigue bloqueada hasta conciliación.
    console.error("Error de red al llamar a EF (REP):", e.message);
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set: {
        estado: "incierto",
        nota:   `Error de red: ${e.message}. Verificar folioEF=${folioEF} en portal EF.`,
      },
      // sin $unset bloqueoFactura
    });
    return res.status(502).json({
      message: `No se pudo confirmar si EF timbró el REP. Verifica folioEF=${folioEF} en el portal de EF.`,
      estado: "incierto", folioEF,
    });
  }

  // ── 6. Procesar respuesta de EF ──────────────────────────────────────────
  if (efRes.AckEnlaceFiscal?.estatusDocumento !== "aceptado") {
    const errorMsg = efRes?.AckEnlaceFiscal?.mensajeError?.descripcionError ?? "Error al timbrar REP";
    console.error("EF ERROR REP:", JSON.stringify(efRes, null, 2));
    // EF rechazó — estado terminal, liberar bloqueo.
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set:   { estado: "fallido", errorMsg },
      $unset: { bloqueoFactura: 1 },
    });
    return res.status(400).json({ message: errorMsg, detalle: efRes });
  }

  // ── 7. EF aceptó — guardar en Mongo ─────────────────────────────────────
  const ack = efRes.AckEnlaceFiscal;

  try {
    // Aplicar pago exactamente una vez (ver punto 3 de la especificación).
    // La condición { $ne: operacion._id } garantiza que aunque este bloque
    // se ejecute dos veces (ej. retry después de timeout de Vercel), el $inc
    // solo ocurra en la primera.
    const facturaActualizada = await Factura.findOneAndUpdate(
      {
        _id: facturaId,
        operacionesRepAplicadas: { $ne: operacion._id },
      },
      {
        $inc:      { totalPagado: monto },
        $addToSet: { operacionesRepAplicadas: operacion._id },
      },
      { new: true },
    );

    // facturaActualizada === null significa que operacion._id ya estaba en el array
    // (ejecución previa completó el $inc). Recuperar el documento actual.
    const facturaFinal = facturaActualizada ?? await Factura.findById(facturaId);
    const nuevoTotalPagado = Math.min(facturaFinal.totalPagado, facturaFinal.total);
    const nuevoEstatus     = nuevoTotalPagado >= facturaFinal.total ? "pagada" : "parcial";

    if (nuevoEstatus !== facturaFinal.estatusPago) {
      await Factura.findByIdAndUpdate(facturaId, { estatusPago: nuevoEstatus });
    }

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
      fechaEmision:       fechaParaMongo(fechaPago),
      urlPdf:             ack.descargaArchivoPDF ?? null,
      urlXml:             ack.descargaXmlCFDi   ?? null,
      urlQr:              ack.descargaArchivoQR  ?? null,
      notas:              notas ?? "",
      facturaRelacionada: facturaId,
      clientePipsa:       factura.clientePipsa,
      creadoPor:          req.userId,
    });

    // Estado terminal exitoso: liberar bloqueoFactura.
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set:   { estado: "timbrado", uuidRep: ack.folioFiscalUUID, folioRep: rep.folio, urlPdf: ack.descargaArchivoPDF ?? null, urlXml: ack.descargaXmlCFDi ?? null, urlQr: ack.descargaArchivoQR ?? null, repFacturaId: rep._id },
      $unset: { bloqueoFactura: 1 },
    });

    return res.status(201).json({ rep, ack });

  } catch (e) {
    // EF aceptó pero falló el guardado en Mongo.
    // El CFDI ya existe en SAT. Marcar timbrado_pendiente_aplicacion.
    // bloqueoFactura se CONSERVA: la factura sigue bloqueada hasta reaplicación.
    console.error("EF aceptó el REP pero falló el guardado en Mongo:", e);
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set: {
        estado:   "timbrado_pendiente_aplicacion",
        nota:     `EF aceptó (UUID=${ack.folioFiscalUUID}, folio=${ack.folioInterno}) pero falló MongoDB: ${e.message}.`,
        uuidRep:  ack.folioFiscalUUID,
        folioRep: `RPA-${ack.folioInterno}`,
        urlPdf:   ack.descargaArchivoPDF ?? null,
        urlXml:   ack.descargaXmlCFDi   ?? null,
      },
      // sin $unset bloqueoFactura
    });
    return res.status(500).json({
      message: `EF timbró el REP (UUID: ${ack.folioFiscalUUID}) pero falló el guardado local. Usa POST /facturacion/rep/aplicar/${operacion._id}.`,
      estado: "timbrado_pendiente_aplicacion", operacionId: operacion._id, uuidEF: ack.folioFiscalUUID,
    });
  }
});




// ════════════════════════════════════════
// POST /facturacion/rep/aplicar/:operacionId
//
// Re-aplica localmente un REP ya timbrado por EF pero no guardado en Mongo.
// NO llama a Enlace Fiscal.
//
// Idempotencia y condiciones de carrera:
//   A) Transición atómica timbrado_pendiente_aplicacion → aplicando.
//      Solo una petición gana; la segunda encuentra estado "aplicando" o
//      "timbrado" y devuelve el resultado ya guardado.
//   B) $inc de totalPagado solo si operacion._id no está en operacionesRepAplicadas
//      ($ne condition). Si ya está registrado, recupera la factura sin incrementar.
//   C) Factura.uuid tiene índice unique+sparse: si el Factura REP ya fue creado
//      en un intento anterior, Factura.create lanza E11000 y se recupera.
//
// Recuperación de "aplicando" abandonado (caída del servidor):
//   El estado "aplicando" puede quedar abandonado. Al recibirlo, este endpoint
//   verifica si la Factura REP y el $inc ya ocurrieron (repFacturaId y
//   operacionesRepAplicadas) y continúa idempotentemente sin duplicar nada.
// ════════════════════════════════════════
router.post("/rep/aplicar/:operacionId", auth, puedeFacturar, async (req, res) => {
  try {
    // ── A. Transición atómica: timbrado_pendiente_aplicacion → aplicando ──
    const operacion = await OperacionRep.findOneAndUpdate(
      { _id: req.params.operacionId, estado: "timbrado_pendiente_aplicacion" },
      { $set: { estado: "aplicando", aplicandoDesde: new Date() } },
      { new: false },
    );

    if (!operacion) {
      const actual = await OperacionRep.findById(req.params.operacionId);
      if (!actual) return res.status(404).json({ message: "Operación no encontrada." });

      if (actual.estado === "timbrado") {
        // Idempotente: ya fue aplicada.
        const repExistente = actual.repFacturaId
          ? await Factura.findById(actual.repFacturaId)
          : await Factura.findOne({ uuid: actual.uuidRep });
        const facturaAct = await Factura.findById(actual.facturaRelacionada).select("totalPagado estatusPago");
        return res.status(200).json({
          idempotente: true,
          rep:     repExistente,
          factura: facturaAct ? { totalPagado: facturaAct.totalPagado, estatusPago: facturaAct.estatusPago } : null,
          message: "El REP ya fue registrado anteriormente.",
        });
      }

      if (actual.estado === "aplicando") {
        // Abandonado por caída. Continuar la aplicación desde donde quedó.
        // Caer al bloque de aplicación usando los datos del documento actual.
        return aplicarOperacionRep(actual, req.userId, res);
      }

      return res.status(409).json({
        message: `La operación está en estado "${actual.estado}". No se puede reaplicar.`,
        estado:  actual.estado,
      });
    }

    // Ganamos la transición — operacion tiene el estado previo (timbrado_pendiente_aplicacion)
    return aplicarOperacionRep(operacion, req.userId, res);

  } catch (e) {
    console.error("Error en /rep/aplicar:", e);
    return res.status(500).json({ message: e.message });
  }
});

// ── Función auxiliar: ejecuta la aplicación local del REP ────────────────
// Compartida entre el path normal y la recuperación de "aplicando" abandonado.
async function aplicarOperacionRep(operacion, userId, res) {
  try {
    if (!operacion.uuidRep) {
      await OperacionRep.findByIdAndUpdate(operacion._id, {
        $set: { estado: "timbrado_pendiente_aplicacion" },
        $unset: { aplicandoDesde: 1 },
      });
      return res.status(500).json({ message: "La operación no tiene UUID guardado. Requiere reconciliación manual." });
    }

    const factura = await Factura.findById(operacion.facturaRelacionada);
    if (!factura) {
      await OperacionRep.findByIdAndUpdate(operacion._id, {
        $set: { estado: "timbrado_pendiente_aplicacion" },
        $unset: { aplicandoDesde: 1 },
      });
      return res.status(404).json({ message: "Factura relacionada no encontrada." });
    }

    const monto     = operacion.monto;
    const formaPago = operacion.formaPago ?? "03";

    // ── B. Crear Factura REP (idempotente por índice uuid unique+sparse) ──
    let rep;
    if (operacion.repFacturaId) {
      // Ya fue creada en un intento anterior — recuperar sin crear duplicado.
      rep = await Factura.findById(operacion.repFacturaId);
    }
    if (!rep) {
      try {
        rep = await Factura.create({
          folio:              operacion.folioRep ?? `RPA-${operacion.folioEF}`,
          serie:              "RPA",
          uuid:               operacion.uuidRep,
          tipo:               "rep",
          estatus:            "vigente",
          moneda:             factura.moneda ?? "MXN",
          subtotal:           0,
          total:              monto,
          totalPagado:        monto,
          receptor:           factura.receptor,
          metodoPago:         "PUE",
          formaPago,
          fechaEmision:       operacion.fechaPago,
          urlPdf:             operacion.urlPdf ?? null,
          urlXml:             operacion.urlXml ?? null,
          urlQr:              operacion.urlQr  ?? null,
          facturaRelacionada: factura._id,
          clientePipsa:       factura.clientePipsa,
          creadoPor:          userId,
        });
      } catch (createErr) {
        if (createErr.code === 11000) {
          // UUID duplicado — creada en intento previo, recuperar.
          rep = await Factura.findOne({ uuid: operacion.uuidRep });
        } else {
          // Error inesperado — revertir a timbrado_pendiente_aplicacion.
          await OperacionRep.findByIdAndUpdate(operacion._id, {
            $set: { estado: "timbrado_pendiente_aplicacion" },
            $unset: { aplicandoDesde: 1 },
          });
          throw createErr;
        }
      }
    }

    // ── C. Aplicar pago exactamente una vez ────────────────────────────────
    // La condición $ne operacion._id garantiza que $inc solo ocurre una vez,
    // incluso si este bloque se ejecuta en dos peticiones simultáneas o en
    // una recuperación de "aplicando" abandonado.
    const facturaActualizada = await Factura.findOneAndUpdate(
      {
        _id: factura._id,
        operacionesRepAplicadas: { $ne: operacion._id },
      },
      {
        $inc:      { totalPagado: monto },
        $addToSet: { operacionesRepAplicadas: operacion._id },
      },
      { new: true },
    );

    // Si no modificó (operacion._id ya estaba), recuperar sin incrementar.
    const facturaFinal     = facturaActualizada ?? await Factura.findById(factura._id);
    const nuevoTotalPagado = Math.min(facturaFinal.totalPagado, factura.total);
    const nuevoEstatus     = nuevoTotalPagado >= factura.total ? "pagada" : "parcial";

    if (nuevoEstatus !== facturaFinal.estatusPago) {
      await Factura.findByIdAndUpdate(factura._id, { estatusPago: nuevoEstatus });
    }

    // ── D. Estado terminal: liberar bloqueoFactura ─────────────────────────
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set:   { estado: "timbrado", repFacturaId: rep._id },
      $unset: { bloqueoFactura: 1, aplicandoDesde: 1 },
    });

    return res.status(201).json({
      rep,
      factura: { totalPagado: nuevoTotalPagado, estatusPago: nuevoEstatus },
      message: "REP reaplicado correctamente.",
    });

  } catch (e) {
    console.error("Error en aplicarOperacionRep:", e);
    // Revertir a timbrado_pendiente_aplicacion para que pueda reintentarse.
    await OperacionRep.findByIdAndUpdate(operacion._id, {
      $set: { estado: "timbrado_pendiente_aplicacion" },
      $unset: { aplicandoDesde: 1 },
    }).catch(() => {});
    return res.status(500).json({ message: e.message });
  }
}

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