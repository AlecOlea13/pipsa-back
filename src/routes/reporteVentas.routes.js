/**
 * reporteVentas.routes.js
 * Ruta en el proyecto: src/routes/reporteVentas.routes.js
 *
 * Registrar en app.js:
 *   import reporteVentasRoutes from "./routes/reporteVentas.routes.js";
 *   app.use("/api/reportes", reporteVentasRoutes);
 *
 * Endpoints:
 *   GET /api/reportes/ventas/equipos   → implementado
 *   GET /api/reportes/ventas/rentas    → pendiente
 *   GET /api/reportes/ventas/servicios → pendiente
 *   GET /api/reportes/ventas/refacciones → pendiente
 *   GET /api/reportes/ventas/otros     → pendiente
 *
 * Acceso: developer y gerencia únicamente (en backend Y en ProtectedRoute del frontend).
 * Rutas específicas definidas antes de cualquier patrón dinámico.
 */

import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import {
  obtenerEquiposVendidos,
  validarFiltros,
} from "../services/reporteVentasEquipos.service.js";
import {
  obtenerServiciosFacturados,
  validarFiltrosServicios,
} from "../services/reporteVentasServicios.service.js";
import {
  obtenerRefaccionesFacturadas,
  validarFiltrosRefacciones,
} from "../services/reporteVentasRefacciones.service.js";
import {
  obtenerRentasActivas,
  validarFiltrosRentas,
} from "../services/reporteVentasRentas.service.js";
import {
  obtenerReporteComisiones,
  validarFiltrosComisiones,
} from "../services/reporteComisiones.service.js";

const router = Router();
const soloDeveloperYGerencia = requireRol("developer", "gerencia");

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/reportes/ventas/equipos
//
//  Query params:
//    desde       "YYYY-MM-DD" inclusivo  (inválido → 400)
//    hasta       "YYYY-MM-DD" inclusivo  (inválido → 400)
//    asesorId    ObjectId string (opcional)
//    clienteId   ObjectId string (opcional)
//    buscar      texto libre   (opcional)
//    page        default 1
//    limit       default 20, máx 100
//    sortBy      lista blanca: venta.fecha | venta.importe | venta.montoFacturado | numeroEconomico | marca
//    sortDir     "asc" | "desc"
// ════════════════════════════════════════════════════════════════════════════
router.get(
  "/ventas/equipos",
  auth,
  soloDeveloperYGerencia,
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;

      const validacion = validarFiltros({ desde, hasta });
      if (!validacion.ok) {
        return res.status(400).json({ message: validacion.mensaje });
      }

      const resultado = await obtenerEquiposVendidos({
        desde,
        hasta,
        asesorId:  req.query.asesorId,
        clienteId: req.query.clienteId,
        buscar:    req.query.buscar,
        page:      req.query.page,
        limit:     req.query.limit,
        sortBy:    req.query.sortBy,
        sortDir:   req.query.sortDir,
      });

      res.json(resultado);
    } catch (err) {
      console.error("[GET /api/reportes/ventas/equipos]", err);
      res.status(500).json({ message: "Error al generar el reporte de equipos" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  Categorías pendientes — responden { estado, disponible, mensaje }
//  El frontend debe interpretar disponible:false y no mostrar totales en cero.
//  Rutas específicas; no hay conflicto de orden con rutas dinámicas.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
//  GET /api/reportes/ventas/servicios
//  Fuente: Cotizacion tipo="servicio" estatus="facturada"
//  Nota: filtra por cotizacion.fecha (no por fechaFacturada, que no existe).
// ════════════════════════════════════════════════════════════════════════════
router.get(
  "/ventas/servicios",
  auth,
  soloDeveloperYGerencia,
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      const validacion = validarFiltrosServicios({ desde, hasta });
      if (!validacion.ok) {
        return res.status(400).json({ message: validacion.mensaje });
      }
      const resultado = await obtenerServiciosFacturados({
        desde,
        hasta,
        asesorId:  req.query.asesorId,
        clienteId: req.query.clienteId,
        buscar:    req.query.buscar,
        page:      req.query.page,
        limit:     req.query.limit,
        sortBy:    req.query.sortBy,
        sortDir:   req.query.sortDir,
      });
      res.json(resultado);
    } catch (err) {
      console.error("[GET /api/reportes/ventas/servicios]", err);
      res.status(500).json({ message: "Error al generar el reporte de servicios" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/reportes/ventas/refacciones
//  Fuente: Cotizacion tipo="refacciones" estatus="facturada"
//  Mismo patrón exacto que /ventas/servicios.
// ════════════════════════════════════════════════════════════════════════════
router.get(
  "/ventas/refacciones",
  auth,
  soloDeveloperYGerencia,
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      const validacion = validarFiltrosRefacciones({ desde, hasta });
      if (!validacion.ok) {
        return res.status(400).json({ message: validacion.mensaje });
      }
      const resultado = await obtenerRefaccionesFacturadas({
        desde,
        hasta,
        asesorId:  req.query.asesorId,
        clienteId: req.query.clienteId,
        buscar:    req.query.buscar,
        page:      req.query.page,
        limit:     req.query.limit,
        sortBy:    req.query.sortBy,
        sortDir:   req.query.sortDir,
      });
      res.json(resultado);
    } catch (err) {
      console.error("[GET /api/reportes/ventas/refacciones]", err);
      res.status(500).json({ message: "Error al generar el reporte de refacciones" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/reportes/ventas/rentas
//  Fuente: Renta estatus="activa"
//  Filtra por fechaInicio. Comisión calculada desde fechaInicio (sin fechaPago).
// ════════════════════════════════════════════════════════════════════════════
router.get(
  "/ventas/rentas",
  auth,
  soloDeveloperYGerencia,
  async (req, res) => {
    try {
      const { desde, hasta } = req.query;
      const validacion = validarFiltrosRentas({ desde, hasta });
      if (!validacion.ok) {
        return res.status(400).json({ message: validacion.mensaje });
      }
      const resultado = await obtenerRentasActivas({
        desde,
        hasta,
        asesorId:  req.query.asesorId,
        clienteId: req.query.clienteId,
        buscar:    req.query.buscar,
        page:      req.query.page,
        limit:     req.query.limit,
        sortBy:    req.query.sortBy,
        sortDir:   req.query.sortDir,
      });
      res.json(resultado);
    } catch (err) {
      console.error("[GET /api/reportes/ventas/rentas]", err);
      res.status(500).json({ message: "Error al generar el reporte de rentas" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/reportes/ventas/comisiones
//  Reporte unificado: Equipos + Servicios + Refacciones + Rentas, por asesor.
// ════════════════════════════════════════════════════════════════════════════
router.get(
  "/ventas/comisiones",
  auth,
  soloDeveloperYGerencia,
  async (req, res) => {
    try {
      const { desde, hasta, asesorId } = req.query;
      const validacion = validarFiltrosComisiones({ desde, hasta });
      if (!validacion.ok) {
        return res.status(400).json({ message: validacion.mensaje });
      }
      const resultado = await obtenerReporteComisiones({ desde, hasta, asesorId });
      res.json(resultado);
    } catch (err) {
      console.error("[GET /api/reportes/ventas/comisiones]", err);
      res.status(500).json({ message: "Error al generar el reporte de comisiones" });
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  Categorías pendientes
// ════════════════════════════════════════════════════════════════════════════
const PENDIENTES = ["otros"];

for (const cat of PENDIENTES) {
  router.get(
    `/ventas/${cat}`,
    auth,
    soloDeveloperYGerencia,
    (_req, res) => res.json({
      estado:     "pendiente",
      disponible: false,
      mensaje:    "Esta categoría todavía no está integrada.",
    })
  );
}

export default router;