import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import Factura from "../models/Factura.js";

const router = Router();

const EF_URL     = "https://api.enlacefiscal.com/v6";
const EF_RFC     = process.env.EF_RFC     ?? "";
const EF_USER    = process.env.EF_USER    ?? "";
const EF_TOKEN   = process.env.EF_TOKEN   ?? "";
const EF_API_KEY = process.env.EF_API_KEY ?? "";

const puedeFacturar = requireRol("developer", "gerencia", "oficina");

// ── Helper: llamar a Enlace Fiscal ──
async function llamarEF(endpoint, body) {
  const credentials = Buffer.from(`${EF_USER}:${EF_TOKEN}`).toString("base64");
  const res = await fetch(`${EF_URL}/${endpoint}`, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key":    EF_API_KEY,
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── Helper: construir partidas con IVA ──
function construirPartidas(partidas, moneda = "MXN") {
  return partidas.map(p => {
    const importe      = parseFloat((p.cantidad * p.valorUnitario).toFixed(2));
    const descuento    = parseFloat((p.descuento ?? 0).toFixed(2));
    const base         = parseFloat((importe - descuento).toFixed(2));
    const importeIva   = parseFloat((base * 0.16).toFixed(2));

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

// ── Helper: calcular totales ──
function calcularTotales(partidas) {
  const subtotal    = partidas.reduce((a, p) => a + p.cantidad * p.valorUnitario, 0);
  const descuentos  = partidas.reduce((a, p) => a + (p.descuento ?? 0), 0);
  const base        = subtotal - descuentos;
  const iva         = parseFloat((base * 0.16).toFixed(2));
  const total       = parseFloat((base + iva).toFixed(2));
  return {
    subtotal:   parseFloat(subtotal.toFixed(2)),
    descuentos: parseFloat(descuentos.toFixed(2)),
    base:       parseFloat(base.toFixed(2)),
    iva,
    total,
  };
}

// ════════════════════════════════════════
// GET /facturacion — listar facturas
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
        { folio:                { $regex: search, $options: "i" } },
        { uuid:                 { $regex: search, $options: "i" } },
        { "receptor.nombre":    { $regex: search, $options: "i" } },
        { "receptor.rfc":       { $regex: search, $options: "i" } },
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
// POST /facturacion/timbrar — nueva factura
// ════════════════════════════════════════
router.post("/timbrar", auth, puedeFacturar, async (req, res) => {
  try {
    const {
      serie = "M", folioInterno, fechaEmision,
      receptor, partidas, metodoPago = "PUE", formaPago = "03",
      condicionesPago, fechaVencimiento, moneda = "MXN", tipoCambio,
      notas, clientePipsaId,
    } = req.body;

    if (!receptor?.rfc || !receptor?.nombre || !partidas?.length) {
      return res.status(400).json({ message: "Faltan datos obligatorios: receptor y partidas" });
    }

    const { subtotal, descuentos, base, iva, total } = calcularTotales(partidas);
    const partidasEF = construirPartidas(partidas, moneda);

    const folio = folioInterno ?? `${Date.now()}`;
    const fecha = fechaEmision
      ? new Date(fechaEmision).toISOString().replace("T", " ").slice(0, 19)
      : new Date().toISOString().replace("T", " ").slice(0, 19);

    const body = {
      CFDi: {
        versionCFDi: "4.0",
        versionEF:   "6.5",
        modo:        "produccion",
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
          rfc:           receptor.rfc,
          nombre:        receptor.nombre.toUpperCase(),
          regimenFiscal: receptor.regimenFiscal ?? "601",
          usoCfdi:       receptor.usoCfdi ?? "G03",
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
        // Enviar correo al cliente si tiene email
        ...(receptor.email ? {
          EnviarCFDI: { Correos: [receptor.email] },
        } : {}),
      },
    };

    const efRes = await llamarEF("generarCfdi", body);

    if (efRes.AckEnlaceFiscal?.estatusDocumento !== "aceptado") {
      return res.status(400).json({
        message: "Error al timbrar",
        detalle: efRes,
      });
    }

    const ack = efRes.AckEnlaceFiscal;

    const factura = await Factura.create({
      folio:        `${serie}-${ack.folioInterno}`,
      serie,
      uuid:         ack.folioFiscalUUID,
      tipo:         "factura",
      estatus:      "vigente",
      estatusPago:  metodoPago === "PUE" ? "sin_pago" : "sin_pago",
      moneda,
      tipoCambio:   tipoCambio ?? null,
      subtotal,
      descuentos,
      total,
      totalPagado:  0,
      receptor: {
        rfc:           receptor.rfc,
        nombre:        receptor.nombre.toUpperCase(),
        regimenFiscal: receptor.regimenFiscal ?? "601",
        usoCfdi:       receptor.usoCfdi ?? "G03",
        cp:            receptor.cp ?? "45235",
      },
      metodoPago,
      formaPago,
      condicionesPago: condicionesPago ?? "",
      fechaEmision:    new Date(fecha),
      fechaVencimiento:fechaVencimiento ? new Date(fechaVencimiento) : null,
      partidas,
      urlPdf:  ack.descargaArchivoPDF  ?? null,
      urlXml:  ack.descargaXmlCFDi    ?? null,
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
// POST /facturacion/rep — recibo electrónico de pago
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

    const folioRep = `REP-${Date.now()}`;
    const monto    = parseFloat(montoPagado.toFixed(2));
    const saldoAnterior = parseFloat((factura.total - factura.totalPagado).toFixed(2));
    const saldoInsoluto = parseFloat(Math.max(0, saldoAnterior - monto).toFixed(2));

    const body = {
      CFDi: {
        versionCFDi: "4.0",
        versionEF:   "6.5",
        modo:        "produccion",
        serie:       "RP",
        folioInterno: folioRep,
        fechaEmision: fecha,
        subTotal:    "0",
        total:       "0",
        rfc:         EF_RFC,
        exportacion: "01",
        DatosDePago: { metodoDePago: "PUE", formaDePago: "99" },
        Receptor: {
          rfc:           factura.receptor.rfc,
          nombre:        factura.receptor.nombre,
          regimenFiscal: factura.receptor.regimenFiscal,
          usoCfdi:       "CP01",
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
        Complemento: {
          Pago20: {
            Totales: {
              montoTotalPagos: monto.toFixed(2),
            },
            Pagos: [{
              fechaPago:   fecha,
              formaDePago: formaPago,
              moneda:      factura.moneda ?? "MXN",
              monto:       monto.toFixed(2),
              ...(referenciaBancaria ? { referenciaBancaria } : {}),
              DocumentosRelacionados: [{
                uuid:              factura.uuid,
                serie:             factura.serie,
                folio:             factura.folio.replace(`${factura.serie}-`, ""),
                moneda:            factura.moneda ?? "MXN",
                metodoPago:        "PPD",
                numParcialidad:    String(factura.totalPagado > 0 ? 2 : 1),
                importeSaldoAnterior: saldoAnterior.toFixed(2),
                importePagado:     monto.toFixed(2),
                importeSaldoInsoluto: saldoInsoluto.toFixed(2),
                objetoDeImpuesto:  "02",
                Impuestos: {
                  Traslados: [{
                    base:          parseFloat((monto / 1.16).toFixed(2)).toFixed(2),
                    impuesto:      "IVA",
                    tipoFactor:    "tasa",
                    tasaOCuota:    "0.16",
                    importe:       parseFloat((monto - monto / 1.16).toFixed(2)).toFixed(2),
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
      return res.status(400).json({ message: "Error al timbrar REP", detalle: efRes });
    }

    const ack = efRes.AckEnlaceFiscal;

    // Actualizar factura
    const nuevoTotalPagado = parseFloat((factura.totalPagado + monto).toFixed(2));
    const nuevoEstatus = nuevoTotalPagado >= factura.total ? "pagada" : "parcial";
    await Factura.findByIdAndUpdate(facturaId, {
      totalPagado:  nuevoTotalPagado,
      estatusPago:  nuevoEstatus,
    });

    // Guardar REP
    const rep = await Factura.create({
      folio:    `RP-${ack.folioInterno}`,
      serie:    "RP",
      uuid:     ack.folioFiscalUUID,
      tipo:     "rep",
      estatus:  "vigente",
      moneda:   factura.moneda ?? "MXN",
      subtotal: 0,
      total:    monto,
      totalPagado: monto,
      receptor: factura.receptor,
      metodoPago: "PUE",
      formaPago,
      fechaEmision: new Date(fecha),
      urlPdf:   ack.descargaArchivoPDF ?? null,
      urlXml:   ack.descargaXmlCFDi   ?? null,
      urlQr:    ack.descargaArchivoQR  ?? null,
      notas:    notas ?? "",
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
        modo:   "produccion",
        rfc:    EF_RFC,
        uuid:   factura.uuid,
        motivo,
        ...(motivo === "01" && uuidSustitucion ? { folioSustitucion: uuidSustitucion } : {}),
      },
    };

    const efRes = await llamarEF("cancelarCfdi", body);
    const ack   = efRes.AckEnlaceFiscal;

    if (!["aceptado", "solicitud_enviada"].includes(ack?.estatusDocumento)) {
      return res.status(400).json({ message: "Error al cancelar", detalle: efRes });
    }

    await Factura.findByIdAndUpdate(req.params.id, { estatus: "cancelada" });
    res.json({ ok: true, ack });
  } catch (e) {
    console.error("Error cancelar:", e);
    res.status(500).json({ message: e.message });
  }
});

// ════════════════════════════════════════
// GET /facturacion/:id — detalle de una factura
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
        modo:  "produccion",
        rfc:   EF_RFC,
        uuid:  factura.uuid,
        Correos: [email],
      },
    };

    const efRes = await llamarEF("enviarCfdi", body);
    res.json({ ok: true, efRes });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ════════════════════════════════════════
// GET /facturacion/clientes/buscar?q=RFC_O_NOMBRE
// ════════════════════════════════════════
router.get("/clientes/buscar", auth, puedeFacturar, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const body = {
      Solicitud: {
        rfc:    EF_RFC,
        accion: "listarClientes",
        modo:   "produccion",
        busqueda: q,
      },
    };

    const efRes = await llamarEF("listarClientes", body);
    const clientes = efRes?.clientes ?? efRes?.Clientes ?? [];
    res.json(clientes);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;