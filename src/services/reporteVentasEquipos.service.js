/**
 * reporteVentasEquipos.service.js
 * Ruta en el proyecto: src/services/reporteVentasEquipos.service.js
 *
 * Fuente autorizada: Montacargas con estatus "vendido" + subdocumento venta.
 * Identidad canónica: equipo:{montacargasId}
 *
 * Exporta:
 *   buildMatchEquipos()       — filtro MongoDB compartido con montacargas.controller.js
 *   obtenerEquiposVendidos()  — datos completos para el nuevo endpoint
 *   validarFiltros()          — validación de fechas; 400 si inválidas
 *   escaparCSV()              — escapa valores para CSV (fórmulas Excel + comillas)
 *   escaparHTML()             — escapa contenido para el reporte imprimible
 */

import mongoose    from "mongoose";
import Montacargas from "../models/Montacargas.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte "YYYY-MM-DD" a un Date local (hora según esFinDelDia).
 * Evita el desfase UTC de new Date("YYYY-MM-DD").
 * Retorna null si el formato o los rangos son inválidos.
 */
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

/** Devuelve v como número finito, o 0 si no lo es. */
function numSeguro(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcula la comisión de una venta de equipo según la política de días de cobro.
 * El tiempo corre desde venta.fecha (fecha de factura) hasta venta.fechaPago.
 * Si no hay fechaPago, devuelve null (pendiente de cobro).
 *
 * Tabla (solo por días — el factor de margen se aplica manualmente por Dirección):
 *   0–30 días  → 3.0%
 *   31–60 días → 2.0%
 *   61–90 días → 1.0%
 *   > 90 días  → 0.0%  (requiere autorización según política)
 *
 * @returns {porcentaje: number, diasCobro: number, monto: number} | null
 */
function calcularComisionEquipo(venta) {
  if (!venta?.fecha || !venta?.fechaPago) return null;

  // Parsear como fecha local para evitar desfase UTC
  function fechaLocalMs(d) {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  }
  const diasCobro = Math.floor((fechaLocalMs(venta.fechaPago) - fechaLocalMs(venta.fecha)) / (1000 * 60 * 60 * 24));

  let porcentaje;
  if      (diasCobro <= 30) porcentaje = 3.0;
  else if (diasCobro <= 60) porcentaje = 2.0;
  else if (diasCobro <= 90) porcentaje = 1.0;
  else                       porcentaje = 0.0;

  // Base = venta.importe (total cobrado = facturado + IVA + efectivo)
  const base  = numSeguro(venta.importe);
  const monto = Math.round(base * (porcentaje / 100) * 100) / 100;

  return { diasCobro, porcentaje, monto };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports públicos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escapa un valor para CSV.
 * - Envuelve en comillas dobles.
 * - Duplica comillas internas.
 * - Neutraliza fórmulas Excel (=, +, -, @) con prefijo apostrofe.
 */
export function escaparCSV(val) {
  const s = String(val ?? "");
  const neutralized = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

/**
 * Escapa contenido para insertar de forma segura en el HTML del reporte imprimible.
 * Nunca usar innerHTML con datos del usuario sin pasar por esta función.
 */
export function escaparHTML(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Valida los parámetros de fecha antes de consultar MongoDB.
 * Retorna { ok: true } o { ok: false, mensaje: string }.
 * El route debe responder 400 cuando ok === false.
 */
export function validarFiltros({ desde, hasta }) {
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (desde && !fDesde) {
    return { ok: false, mensaje: `Fecha "desde" inválida: "${desde}". Use formato YYYY-MM-DD.` };
  }
  if (hasta && !fHasta) {
    return { ok: false, mensaje: `Fecha "hasta" inválida: "${hasta}". Use formato YYYY-MM-DD.` };
  }
  if (fDesde && fHasta && fDesde > fHasta) {
    return {
      ok: false,
      mensaje: `Rango de fechas invertido: "desde" (${desde}) es posterior a "hasta" (${hasta}).`,
    };
  }
  return { ok: true };
}

/**
 * Construye el objeto match de MongoDB compartido entre:
 *   - reporteVentas.routes.js  (nuevo endpoint)
 *   - montacargas.controller.js (handler existente reporteVentas)
 *
 * Ambos endpoints usan este mismo filtro → garantiza conciliación exacta.
 *
 * @param {{ desde?, hasta?, asesorId?, clienteId?, buscar? }} params
 */
export function buildMatchEquipos({ desde, hasta, asesorId, clienteId, buscar } = {}) {
  const match = { estatus: "vendido" };

  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;

  if (fDesde || fHasta) {
    match["venta.fecha"] = {};
    if (fDesde) match["venta.fecha"].$gte = fDesde;
    if (fHasta) match["venta.fecha"].$lte = fHasta;
  }

  if (asesorId && mongoose.isValidObjectId(asesorId)) {
    // venta.asesor es un ObjectId directo (no embedded), se filtra sin ._id
    match["venta.asesor"] = new mongoose.Types.ObjectId(asesorId);
  }

  if (clienteId && mongoose.isValidObjectId(clienteId)) {
    // venta.cliente es un ObjectId directo
    match["venta.cliente"] = new mongoose.Types.ObjectId(clienteId);
  }

  if (buscar?.trim()) {
    // Escapar caracteres especiales de regex para evitar inyección
    const escaped = buscar.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");
    match.$or = [
      { numeroEconomico:        re },
      { marca:                  re },
      { modelo:                 re },
      { "venta.cliente.nombre": re },
      { "venta.clienteNombre":  re },
      { "venta.asesor.nombre":  re },
      { "venta.numeroFactura":  re },
    ];
  }

  return match;
}

/**
 * Consulta principal del reporte de equipos vendidos.
 * Incluye resumen, agrupación por asesor, operaciones paginadas y auditoría de importes.
 */
export async function obtenerEquiposVendidos(filtros = {}) {
  const {
    desde,
    hasta,
    asesorId,
    clienteId,
    buscar,
    page:    rawPage    = 1,
    limit:   rawLimit   = 20,
    sortBy:  rawSortBy  = "venta.fecha",
    sortDir: rawSortDir = "desc",
  } = filtros;

  const page  = Math.max(1, parseInt(rawPage, 10)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));

  // Lista blanca de campos para ordenamiento
  const SORT_WHITELIST = new Set([
    "venta.fecha", "venta.importe", "venta.montoFacturado", "numeroEconomico", "marca",
  ]);
  const sortField = SORT_WHITELIST.has(rawSortBy) ? rawSortBy : "venta.fecha";
  const sortDir   = rawSortDir === "asc" ? 1 : -1;

  const match = buildMatchEquipos({ desde, hasta, asesorId, clienteId, buscar });

  // ── Conteo total (para paginación) ───────────────────────────────────────
  const total = await Montacargas.countDocuments(match);

  // ── Resumen agregado ─────────────────────────────────────────────────────
  const [agg] = await Montacargas.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        equiposVendidos:             { $sum: 1 },
        ventaComercialTotal:         { $sum: { $ifNull: ["$venta.importe",        0] } },
        subtotalFacturadoRegistrado: { $sum: { $ifNull: ["$venta.montoFacturado", 0] } },
        ivaRegistrado:               { $sum: { $ifNull: ["$venta.ivaFacturado",   0] } },
        ventaEfectivo:               { $sum: { $ifNull: ["$venta.montoEfectivo",  0] } },
      },
    },
  ]);

  const ev  = numSeguro(agg?.equiposVendidos);
  const vct = numSeguro(agg?.ventaComercialTotal);

  const resumen = {
    equiposVendidos:             ev,
    ventaComercialTotal:         vct,
    subtotalFacturadoRegistrado: numSeguro(agg?.subtotalFacturadoRegistrado),
    ivaRegistrado:               numSeguro(agg?.ivaRegistrado),
    ventaEfectivo:               numSeguro(agg?.ventaEfectivo),
    ticketPromedio: ev > 0 ? Math.round((vct / ev) * 100) / 100 : 0,
  };

  // ── Agrupación por asesor ────────────────────────────────────────────────
  const aggAsesor = await Montacargas.aggregate([
    { $match: match },
    {
      $group: {
        // venta.asesor es ObjectId — agrupar por el ObjectId directamente
        _id: { asesorId: "$venta.asesor" },
        equiposVendidos:             { $sum: 1 },
        ventaComercialTotal:         { $sum: { $ifNull: ["$venta.importe",        0] } },
        subtotalFacturadoRegistrado: { $sum: { $ifNull: ["$venta.montoFacturado", 0] } },
        ivaRegistrado:               { $sum: { $ifNull: ["$venta.ivaFacturado",   0] } },
        ventaEfectivo:               { $sum: { $ifNull: ["$venta.montoEfectivo",  0] } },
      },
    },
    {
      $lookup: {
        from: "asesors",    // nombre real de la colección en MongoDB (Mongoose pluraliza "Asesor" → "asesors")
        localField: "_id.asesorId",
        foreignField: "_id",
        as: "_asesorDoc",
      },
    },
    {
      $addFields: {
        "_id.asesorNombre": { $ifNull: [{ $arrayElemAt: ["$_asesorDoc.nombre", 0] }, null] },
      },
    },
    { $project: { _asesorDoc: 0 } },
    { $sort: { ventaComercialTotal: -1 } },
  ]);

  const porAsesor = aggAsesor.map(g => {
    const eq = numSeguro(g.equiposVendidos);
    const vt = numSeguro(g.ventaComercialTotal);
    return {
      asesorId:     g._id.asesorId    ?? null,
      asesorNombre: g._id.asesorNombre ?? "Sin asesor asignado",
      equiposVendidos:             eq,
      ventaComercialTotal:         vt,
      subtotalFacturadoRegistrado: numSeguro(g.subtotalFacturadoRegistrado),
      ivaRegistrado:               numSeguro(g.ivaRegistrado),
      ventaEfectivo:               numSeguro(g.ventaEfectivo),
      ticketPromedio:  eq > 0 ? Math.round((vt / eq) * 100) / 100 : 0,
      participacion:  vct > 0 ? Math.round((vt / vct) * 10000) / 100 : 0,
    };
  });

  // ── Operaciones paginadas ────────────────────────────────────────────────
  const docs = await Montacargas.find(match)
    .sort({ [sortField]: sortDir })
    .skip((page - 1) * limit)
    .limit(limit)
    .select("_id numeroEconomico marca modelo serie capacidad tipo venta")
    .populate("venta.asesor",  "nombre")
    .populate("venta.cliente", "nombre")
    .lean();

  const operaciones = docs.map(m => {
    const montoFacturado   = numSeguro(m.venta?.montoFacturado);
    const ivaFacturado     = numSeguro(m.venta?.ivaFacturado);
    const montoEfectivo    = numSeguro(m.venta?.montoEfectivo);
    const importeGuardado  = numSeguro(m.venta?.importe);
    const importeCalculado = Math.round((montoFacturado + ivaFacturado + montoEfectivo) * 100) / 100;
    const diferencia       = Math.round(Math.abs(importeGuardado - importeCalculado) * 100) / 100;

    return {
      id:              `equipo:${m._id}`,
      montacargasId:   m._id,
      numeroEconomico: m.numeroEconomico ?? "",
      marca:           m.marca           ?? "",
      modelo:          m.modelo          ?? "",
      serie:           m.serie           ?? "",
      capacidad:       m.capacidad        ?? "",
      tipoCombustible: m.tipo             ?? "",
      venta: {
        fecha:             m.venta?.fecha        ?? null,
        importe:           importeGuardado,
        montoFacturado,
        ivaFacturado,
        montoEfectivo,
        importeCalculado,
        diferenciaImporte: diferencia,
        requiereRevision:  diferencia > 0.01,
        numeroFactura:     m.venta?.numeroFactura ?? null,
        fechaPago:         m.venta?.fechaPago     ?? null,
        notas:             m.venta?.notas         ?? null,
        // Comisión calculada por días de cobro (factura → pago)
        // null si aún no se ha registrado la fecha de pago
        comision:          calcularComisionEquipo(m.venta),
        cliente: m.venta?.cliente
          ? { id: m.venta.cliente._id, nombre: m.venta.cliente.nombre }
          : m.venta?.clienteNombre
            ? { id: null, nombre: m.venta.clienteNombre }
            : null,
        asesor: m.venta?.asesor
          ? { id: m.venta.asesor._id, nombre: m.venta.asesor.nombre }
          : null,
      },
    };
  });

  // Resumen de comisiones: solo operaciones que ya tienen fechaPago
  const opsConComision = operaciones.filter(op => op.venta.comision !== null);
  const comisionResumen = {
    operacionesConPago:    opsConComision.length,
    operacionesSinPago:    operaciones.length - opsConComision.length,
    montoTotalComisiones:  Math.round(opsConComision.reduce((acc, op) => acc + (op.venta.comision?.monto ?? 0), 0) * 100) / 100,
    advertenciaMargen:     "El % de comisión mostrado corresponde únicamente al plazo de cobro. El porcentaje final depende también del margen bruto de la operación según la política de comisiones vigente.",
  };

  return {
    resumen,
    porAsesor,
    operaciones,
    comisionResumen,
    paginacion: { page, limit, total, pages: Math.ceil(total / limit) },
    disponibilidad: { facturacionConciliada: false, cobranza: false, saldo: false },
  };
}