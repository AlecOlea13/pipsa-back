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
// Cartera agrupada por cliente
// ════════════════════════════════════════
router.get("/cartera", auth, soloDeveloperYGerencia, async (req, res) => {
  try {
    const { default: CuentaCobrar } = await import("../models/CuentaCobrar.js");

    const cartera = await CuentaCobrar.aggregate([
      { $match: { estatus: { $in: ["pendiente", "parcial"] } } },
      {
        $group: {
          _id:                "$nombreReceptor",
          totalFacturado:     { $sum: "$total" },
          totalCobrado:       { $sum: "$montoPagado" },
          facturas:           { $sum: 1 },
          facturasPendientes: { $sum: { $cond: [{ $eq: ["$estatus", "pendiente"] }, 1, 0] } },
          facturasParciales:  { $sum: { $cond: [{ $eq: ["$estatus", "parcial"]  }, 1, 0] } },
          ultimaEmision:      { $max: "$fechaEmision" },
          documentos: {
            $push: {
              folioFactura: "$folioFactura",
              total:        "$total",
              montoPagado:  "$montoPagado",
              estatus:      "$estatus",
              fechaEmision: "$fechaEmision",
            },
          },
        },
      },
      {
        $addFields: {
          saldoPendiente: { $subtract: ["$totalFacturado", "$totalCobrado"] },
        },
      },
      { $sort: { saldoPendiente: -1 } },
    ]);

    const totalCartera = cartera.reduce((a, c) => a + c.saldoPendiente, 0);

    res.json({ totalCartera, clientes: cartera });
  } catch (e) {
    console.error("Error /api/resumen/cartera:", e);
    res.status(500).json({ message: e.message });
  }
});

export default router;