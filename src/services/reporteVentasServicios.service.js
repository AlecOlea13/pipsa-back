/**
 * reporteVentasServicios.service.js
 * Ruta en el proyecto: src/services/reporteVentasServicios.service.js
 *
 * Fuente: Cotizacion con tipo="servicio" y estatus="facturada"
 * Identidad canónica: servicio:{cotizacionId}
 *
 * NOTA IMPORTANTE:
 * - No existe campo "fechaFacturada" en el modelo. Se filtra por cotizacion.fecha.
 * - No existe desglose mano de obra / refacciones en cotizaciones; solo items[].
 * - numeroFactura es texto libre, no FK a colección facturas.
 * - La fecha de pago de comisión se calcula como la segunda semana del mes siguiente.
 */

import mongoose  from "mongoose";
import Cotizacion from "../models/Cotizacion.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers compartidos (mismos que en reporteVentasEquipos.service.js)
// ─────────────────────────────────────────────────────────────────────────────

function fechaLocalMX(str, esFinDelDia = false) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const fecha = new Date(
    y, mo - 1, d,
    esFinDelDia ? 23 : 0,
    esFinDelDia ? 59 : 0,
    esFinDelDia ? 59 : 0,
  );
  return isNaN(fecha.getTime()) ? null : fecha;
}

function numSeguro(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcula la comisión de un servicio según días de cobro.
 * Base: cotizacion.total. Referencia de tiempo: cotizacion.fecha → cotizacion.fechaPago.
 *
 *   0–30 días  → 3.0%
 *   31–60 días → 2.0%
 *   61–90 días → 1.0%
 *   > 90 días  → 0.0%  (requiere autorización)
 *
 * Retorna null si no hay fechaPago registrada.
 */
function calcularComisionServicio(cotizacion) {
  if (!cotizacion?.fecha || !cotizacion?.fechaPago) return null;
  const fechaRef  = new Date(cotizacion.fecha);
  const fechaPago = new Date(cotizacion.fechaPago);
  fechaRef.setHours(0, 0, 0, 0);
  fechaPago.setHours(0, 0, 0, 0);
  const diasCobro  = Math.round((fechaPago - fechaRef) / (1000 * 60 * 60 * 24));
  const porcentaje = diasCobro <= 30 ? 3.0 : diasCobro <= 60 ? 2.0 : diasCobro <= 90 ? 1.0 : 0.0;
  const base       = numSeguro(cotizacion.total);
  const monto      = Math.round(base * (porcentaje / 100) * 100) / 100;
  return { diasCobro, porcentaje, monto };
}

export function escaparCSV(val) {
  const s = String(val ?? "");
  const neutralized = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function escaparHTML(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Calcula la "segunda semana del mes siguiente" a una fecha dada.
 * Devuelve { inicio: Date, fin: Date, etiqueta: string }
 */
function calcularFechaComision(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  // Primer día del mes siguiente
  const mesInicio = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  // Segunda semana = día 8 al 14 del mes siguiente (lunes de esa semana)
  const dia8 = new Date(mesInicio.getFullYear(), mesInicio.getMonth(), 8);
  // Ajustar al lunes de esa semana
  const dow = dia8.getDay(); // 0=dom, 1=lun ... 6=sab
  const diasHastaLunes = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
  const lunes = new Date(dia8);
  lunes.setDate(dia8.getDate() + (dow === 1 ? 0 : diasHastaLunes));
  lunes.setHours(0, 0, 0, 0);
  const viernes = new Date(lunes);
  viernes.setDate(lunes.getDate() + 4);
  viernes.setHours(23, 59, 59, 999);
  const opts = { day: "2-digit", month: "short", year: "numeric" };
  return {
    inicio:   lunes,
    fin:      viernes,
    etiqueta: `${lunes.toLocaleDateString("es-MX", opts)} – ${viernes.toLocaleDateString("es-MX", opts)}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación de filtros
// ─────────────────────────────────────────────────────────────────────────────

export function validarFiltrosServicios({ desde, hasta }) {
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (desde && !fDesde) {
    return { ok: false, mensaje: `Fecha "desde" inválida: "${desde}". Use formato YYYY-MM-DD.` };
  }
  if (hasta && !fHasta) {
    return { ok: false, mensaje: `Fecha "hasta" inválida: "${hasta}". Use formato YYYY-MM-DD.` };
  }
  if (fDesde && fHasta && fDesde > fHasta) {
    return { ok: false, mensaje: `Rango invertido: "desde" (${desde}) es posterior a "hasta" (${hasta}).` };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtro MongoDB base (reutilizable externamente si se necesita)
// ─────────────────────────────────────────────────────────────────────────────

export function buildMatchServicios({ desde, hasta, asesorId, clienteId, buscar } = {}) {
  const match = {
    tipo:    "servicio",
    estatus: "facturada",
  };

  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;

  if (fDesde || fHasta) {
    match.fecha = {};
    if (fDesde) match.fecha.$gte = fDesde;
    if (fHasta) match.fecha.$lte = fHasta;
  }

  if (asesorId && mongoose.isValidObjectId(asesorId)) {
    // asesor es ObjectId directo (igual que en Montacargas)
    match.asesor = new mongoose.Types.ObjectId(asesorId);
  }

  if (clienteId && mongoose.isValidObjectId(clienteId)) {
    match.cliente = new mongoose.Types.ObjectId(clienteId);
  }

  if (buscar?.trim()) {
    const escaped = buscar.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    match.$or = [
      { folio:                      re },
      { "clienteOcasional.nombre":  re },
      { numeroFactura:              re },
      { descripcionServicio:        re },
    ];
  }

  return match;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consulta principal
// ─────────────────────────────────────────────────────────────────────────────

export async function obtenerServiciosFacturados(filtros = {}) {
  const {
    desde,
    hasta,
    asesorId,
    clienteId,
    buscar,
    page:    rawPage    = 1,
    limit:   rawLimit   = 20,
    sortBy:  rawSortBy  = "fecha",
    sortDir: rawSortDir = "desc",
  } = filtros;

  const page  = Math.max(1, parseInt(rawPage, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));

  const SORT_WHITELIST = new Set([
    "fecha", "total", "subtotal", "folio",
  ]);
  const sortField = SORT_WHITELIST.has(rawSortBy) ? rawSortBy : "fecha";
  const sortDir   = rawSortDir === "asc" ? 1 : -1;

  const match = buildMatchServicios({ desde, hasta, asesorId, clienteId, buscar });

  // ── Conteo total ──────────────────────────────────────────────────────────
  const total = await Cotizacion.countDocuments(match);

  // ── Resumen agregado ─────────────────────────────────────────────────────
  const [agg] = await Cotizacion.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        serviciosVendidos:  { $sum: 1 },
        subtotalComercial:  { $sum: { $ifNull: ["$subtotal", 0] } },
        ivaRegistrado:      { $sum: { $ifNull: ["$iva",      0] } },
        ventaComercialTotal:{ $sum: { $ifNull: ["$total",    0] } },
      },
    },
  ]);

  const sv  = numSeguro(agg?.serviciosVendidos);
  const vct = numSeguro(agg?.ventaComercialTotal);

  const resumen = {
    serviciosVendidos:    sv,
    // manoObraTotal y refaccionesTotal no existen en el modelo de Cotizacion —
    // los items son texto libre sin categoría. Se reportan null explícitamente.
    manoObraTotal:        null,
    refaccionesTotal:     null,
    subtotalComercial:    numSeguro(agg?.subtotalComercial),
    ivaRegistrado:        numSeguro(agg?.ivaRegistrado),
    ventaComercialTotal:  vct,
    ticketPromedio:       sv > 0 ? Math.round((vct / sv) * 100) / 100 : 0,
  };

  // ── Por asesor con $lookup ────────────────────────────────────────────────
  const aggAsesor = await Cotizacion.aggregate([
    { $match: match },
    {
      $group: {
        _id: { asesorId: "$asesor" },
        serviciosVendidos:   { $sum: 1 },
        ventaComercialTotal: { $sum: { $ifNull: ["$total",    0] } },
        subtotalComercial:   { $sum: { $ifNull: ["$subtotal", 0] } },
        ivaRegistrado:       { $sum: { $ifNull: ["$iva",      0] } },
      },
    },
    {
      $lookup: {
        from:         "asesors",
        localField:   "_id.asesorId",
        foreignField: "_id",
        as:           "_asesorDoc",
      },
    },
    {
      $addFields: {
        "_id.asesorNombre": {
          $ifNull: [{ $arrayElemAt: ["$_asesorDoc.nombre", 0] }, null],
        },
      },
    },
    { $project: { _asesorDoc: 0 } },
    { $sort: { ventaComercialTotal: -1 } },
  ]);

  const porAsesor = aggAsesor.map(g => {
    const sv2 = numSeguro(g.serviciosVendidos);
    const vt  = numSeguro(g.ventaComercialTotal);
    return {
      asesorId:            g._id.asesorId    ?? null,
      asesorNombre:        g._id.asesorNombre ?? "Sin asesor asignado",
      serviciosVendidos:   sv2,
      ventaComercialTotal: vt,
      subtotalComercial:   numSeguro(g.subtotalComercial),
      ivaRegistrado:       numSeguro(g.ivaRegistrado),
      manoObraTotal:       null,
      refaccionesTotal:    null,
      ticketPromedio:      sv2 > 0 ? Math.round((vt / sv2) * 100) / 100 : 0,
      participacion:       vct > 0 ? Math.round((vt / vct) * 10000) / 100 : 0,
    };
  });

  // ── Operaciones paginadas ─────────────────────────────────────────────────
  const docs = await Cotizacion.find(match)
    .sort({ [sortField]: sortDir })
    .skip((page - 1) * limit)
    .limit(limit)
    .select("_id folio tipo fecha subtotal iva total moneda estatus numeroFactura fechaPago descripcionServicio items cliente clienteOcasional asesor equipoMarca equipoModelo equipoSerie")
    .populate("asesor",  "nombre")
    .populate("cliente", "nombre")
    .lean();

  const operaciones = docs.map(c => {
    const comision = calcularFechaComision(c.fecha);
    return {
      id:            `servicio:${c._id}`,
      cotizacionId:  c._id,
      folio:         c.folio,
      fecha:         c.fecha ?? null,
      moneda:        c.moneda ?? "MXN",
      subtotal:      numSeguro(c.subtotal),
      iva:           numSeguro(c.iva),
      total:         numSeguro(c.total),
      numeroFactura: c.numeroFactura ?? null,   // texto libre, no FK
      descripcion:   c.descripcionServicio ?? null,
      itemsCount:    c.items?.length ?? 0,
      equipoMarca:   c.equipoMarca  ?? null,
      equipoModelo:  c.equipoModelo ?? null,
      equipoSerie:   c.equipoSerie  ?? null,
      // Comisión: segunda semana del mes siguiente a la fecha de la cotización
      fechaPagoComision: comision ? {
        inicio:   comision.inicio,
        fin:      comision.fin,
        etiqueta: comision.etiqueta,
      } : null,
      fechaPago: c.fechaPago ?? null,
      // Comisión calculada por días de cobro (fecha cotización → fechaPago)
      // null si aún no se ha registrado la fecha de pago
      comision: calcularComisionServicio(c),
      cliente: c.cliente
        ? { id: c.cliente._id, nombre: c.cliente.nombre }
        : c.clienteOcasional?.nombre
          ? { id: null, nombre: c.clienteOcasional.nombre }
          : null,
      asesor: c.asesor
        ? { id: c.asesor._id, nombre: c.asesor.nombre }
        : null,
    };
  });

  // Resumen de comisiones
  const opsConComision = operaciones.filter(op => op.comision !== null);
  const comisionResumen = {
    operacionesConPago:   opsConComision.length,
    operacionesSinPago:   operaciones.length - opsConComision.length,
    montoTotalComisiones: Math.round(
      opsConComision.reduce((acc, op) => acc + (op.comision?.monto ?? 0), 0) * 100
    ) / 100,
    advertenciaMargen: "El % corresponde únicamente al plazo de cobro. El % final depende también del margen bruto según la política de comisiones vigente.",
  };

  return {
    resumen,
    porAsesor,
    operaciones,
    paginacion: { page, limit, total, pages: Math.ceil(total / limit) },
    disponibilidad: {
      facturacionConciliada: false,  // numeroFactura es texto libre, sin FK
      cobranza:              false,
      saldo:                 false,
    },
    // Metadatos de la consulta para que el frontend pueda advertir al usuario
    meta: {
      fuenteFecha:   "cotizacion.fecha",
      advertencia:   "El filtro de fechas usa la fecha de la cotización, no la fecha de facturación. No existe campo fechaFacturada en el modelo.",
      manoObra:      "No disponible: los items de cotizaciones de servicio son texto libre sin categoría.",
    },
  };
}