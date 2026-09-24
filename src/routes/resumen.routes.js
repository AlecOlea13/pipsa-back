import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const soloDeveloperYGerencia = requireRol("developer", "gerencia");

async function getModels() {
  const [
    { default: Servicio },
    { default: Cotizacion },
    { default: Factura },
    { default: SolicitudCompra },
  ] = await Promise.all([
    import("../models/Servicio.js"),
    import("../models/Cotizacion.js"),
    import("../models/Factura.js"),
    import("../models/SolicitudCompra.js"),
  ]);
  return { Servicio, Cotizacion, Factura, SolicitudCompra };
}

// ════════════════════════════════════════
// GET /api/resumen
// ════════════════════════════════════════
router.get("/", auth, soloDeveloperYGerencia, async (req, res) => {
  try {
    const { Servicio, Cotizacion, Factura, SolicitudCompra } = await getModels();

    const ahora = new Date();
    const hace7  = new Date(ahora); hace7.setDate(ahora.getDate() - 7);
    const hace30 = new Date(ahora); hace30.setDate(ahora.getDate() - 30);

    const [
      serviciosSemana,
      serviciosAbiertos,
      tecnicoMasActivo,
      cotizacionesSemana,
      cotizacionesPorEstatus,
      cotizacionesPorTipo,
      facturasSemana,
      facturasVigentes,
      montoFacturadoSemana,
      solicitudesSemana,
      solicitudesPorEstatus,
      ultimosServicios,
      ultimasCotizaciones,
      ultimasFacturas,
    ] = await Promise.all([
      Servicio.countDocuments({ createdAt: { $gte: hace7 } }),
      Servicio.countDocuments({ estatus: { $in: ["abierto", "en_proceso"] } }),
      Servicio.aggregate([
        { $match: { createdAt: { $gte: hace7 }, tecnicoAsignado: { $exists: true, $ne: null } } },
        { $group: { _id: "$tecnicoAsignado", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
        { $unwind: { path: "$u", preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, nombre: "$u.nombre", total: 1 } },
      ]),
      Cotizacion.countDocuments({ createdAt: { $gte: hace7 } }),
      Cotizacion.aggregate([
        { $match: { createdAt: { $gte: hace30 } } },
        { $group: { _id: "$estatus", total: { $sum: 1 } } },
      ]),
      Cotizacion.aggregate([
        { $match: { createdAt: { $gte: hace30 } } },
        { $group: { _id: "$tipo", total: { $sum: 1 } } },
      ]),
      Factura.countDocuments({ tipo: "factura", createdAt: { $gte: hace7 } }),
      Factura.countDocuments({ tipo: "factura", estatus: "vigente" }),
      Factura.aggregate([
        { $match: { tipo: "factura", createdAt: { $gte: hace7 }, estatus: { $ne: "cancelada" } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      SolicitudCompra.countDocuments({ createdAt: { $gte: hace7 } }),
      SolicitudCompra.aggregate([
        { $match: { createdAt: { $gte: hace30 } } },
        { $group: { _id: "$estatus", total: { $sum: 1 } } },
      ]),
      Servicio.find({ createdAt: { $gte: hace7 } })
        .populate("tecnicoAsignado", "nombre")
        .populate("montacargas", "numeroEconomico marca modelo")
        .select("folio estatus fechaInicio fechaCierre tecnicoAsignado montacargas")
        .sort({ createdAt: -1 })
        .limit(10),
      Cotizacion.find({ createdAt: { $gte: hace7 } })
        .populate("asesor", "nombre")
        .select("folio tipo estatus total moneda cliente clienteOcasional asesor")
        .sort({ createdAt: -1 })
        .limit(10),
      Factura.find({ tipo: "factura", createdAt: { $gte: hace7 } })
        .select("folio estatus estatusPago total moneda receptor fechaEmision")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    res.json({
      generadoEn: ahora.toISOString(),
      servicios: {
        enSemana:         serviciosSemana,
        abiertosAhora:    serviciosAbiertos,
        tecnicoMasActivo: tecnicoMasActivo[0] ?? null,
        ultimos:          ultimosServicios,
      },
      cotizaciones: {
        enSemana:   cotizacionesSemana,
        porEstatus: Object.fromEntries(cotizacionesPorEstatus.map(x => [x._id, x.total])),
        porTipo:    Object.fromEntries(cotizacionesPorTipo.map(x => [x._id, x.total])),
        ultimas:    ultimasCotizaciones,
      },
      facturas: {
        enSemana:    facturasSemana,
        vigentes:    facturasVigentes,
        montoSemana: montoFacturadoSemana[0]?.total ?? 0,
        ultimas:     ultimasFacturas,
      },
      solicitudesCompra: {
        enSemana:   solicitudesSemana,
        porEstatus: Object.fromEntries(solicitudesPorEstatus.map(x => [x._id, x.total])),
      },
    });
  } catch (e) {
    console.error("Error /api/resumen:", e);
    res.status(500).json({ message: e.message });
  }
});

// ════════════════════════════════════════
// GET /api/resumen/cartera
// Retrocompatibilidad — el front viejo sigue funcionando.
// Ahora calcula fechaVencimiento, diasVencidos y rango por factura.
// ════════════════════════════════════════
router.get("/cartera", auth, soloDeveloperYGerencia, async (req, res) => {
  try {
    const { default: CuentaCobrar } = await import("../models/CuentaCobrar.js");
    const { default: Cliente }      = await import("../models/Cliente.js");
    const {
      toMexDay,
      enriquecerFacturas,
    } = await import("./cartera.utils.js");

    const fechaCorte = toMexDay(new Date());

    // Mapa RFC → diasCredito del modelo Cliente
    const rfcs     = await CuentaCobrar.distinct("rfcReceptor", {
      estatus: { $in: ["pendiente", "parcial"] },
    });
    const clientes = await Cliente.find({ rfc: { $in: rfcs } })
      .select("rfc diasCredito")
      .lean();
    const mapaRfc  = Object.fromEntries(
      clientes.map(c => [c.rfc, c.diasCredito ?? null])
    );

    // Traer todos los documentos pendientes/parciales
    const docs = await CuentaCobrar.find({ estatus: { $in: ["pendiente", "parcial"] } })
      .select("nombreReceptor rfcReceptor folioFactura uuid fechaEmision fechaVencimiento diasCredito total montoPagado estatus pagos fechaPago")
      .lean();

    // Enriquecer y agrupar por nombreReceptor
    const mapaCliente = {};
    for (const doc of docs) {
      const diasCredCli = mapaRfc[doc.rfcReceptor] ?? null;
      const [fact]      = enriquecerFacturas([doc], fechaCorte, diasCredCli);
      const key         = doc.nombreReceptor ?? "Sin nombre";

      if (!mapaCliente[key]) {
        mapaCliente[key] = {
          _id:                key,
          totalFacturado:     0,
          totalCobrado:       0,
          facturas:           0,
          facturasPendientes: 0,
          facturasParciales:  0,
          ultimaEmision:      null,
          documentos:         [],
        };
      }

      const g = mapaCliente[key];
      g.totalFacturado += doc.total ?? 0;
      g.totalCobrado   += doc.montoPagado ?? 0;
      g.facturas       += 1;
      if (doc.estatus === "pendiente") g.facturasPendientes += 1;
      if (doc.estatus === "parcial")   g.facturasParciales  += 1;
      if (!g.ultimaEmision || (doc.fechaEmision && doc.fechaEmision > g.ultimaEmision))
        g.ultimaEmision = doc.fechaEmision;

      g.documentos.push({
        folioFactura:     doc.folioFactura,
        total:            doc.total ?? 0,
        montoPagado:      doc.montoPagado ?? 0,
        estatus:          doc.estatus,
        fechaEmision:     doc.fechaEmision,
        // Campos nuevos que el front viejo ignora pero el nuevo aprovecha
        fechaVencimiento: fact.fechaVencimiento,
        diasVencidos:     fact.diasVencidos,
        rango:            fact.rango,
        estado:           fact.estado,
        saldo:            fact.saldo,
      });
    }

    const cartera = Object.values(mapaCliente)
      .map(g => ({
        ...g,
        saldoPendiente: g.totalFacturado - g.totalCobrado,
      }))
      .sort((a, b) => b.saldoPendiente - a.saldoPendiente);

    const totalCartera = cartera.reduce((a, c) => a + c.saldoPendiente, 0);
    res.json({ totalCartera, clientes: cartera });
  } catch (e) {
    console.error("Error /api/resumen/cartera:", e);
    res.status(500).json({ message: e.message });
  }
});

export default router;