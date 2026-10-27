/**
 * reporteVentasRefacciones.service.js
 * Ruta en el proyecto: src/services/reporteVentasRefacciones.service.js
 *
 * Fuente: Cotizacion con tipo="refacciones" y estatus="facturada"
 * Identidad canónica: refaccion:{cotizacionId}
 *
 * Mismo patrón exacto que reporteVentasServicios.service.js — Refacciones
 * y Servicios comparten estructura (Cotizacion con items de texto libre),
 * solo cambia el tipo filtrado.
 *
 * NOTA IMPORTANTE:
 * - No existe campo "fechaFacturada" en el modelo para documentos antiguos;
 *   se usa como fallback cotizacion.fecha.
 * - Los items de refacciones son texto libre; no hay desglose de piezas
 *   individuales con cantidad/precio estructurado fuera de items[].
 * - numeroFactura es texto libre, no FK a colección facturas.
 */

import mongoose  from "mongoose";
import Cotizacion from "../models/Cotizacion.js";
import { calcularComision, resolverSubtotal, round2, numSeguro as numSeguroCentral } from "./comisiones.util.js";

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
 * Base: subtotal SIN IVA (comisiones.util.js → resolverSubtotal). Referencia de tiempo: cotizacion.fechaFacturada (o fecha) → cotizacion.fechaPago.
 *
 *   0–30 días  → 3.0%
 *   31–60 días → 2.0%
 *   61–90 días → 1.0%
 *   > 90 días  → 0.0%  (requiere autorización)
 *
 * Retorna null si no hay fechaPago registrada.
 */
function calcularComisionRefaccion(cotizacion) {
  // Usar fechaFacturada si existe, sino fallback a fecha de la cotización
  // (para registros anteriores a la implementación de fechaFacturada)
  const refBase = cotizacion?.fechaFacturada ?? cotizacion?.fecha;
  const resultado = calcularComision({
    doc: cotizacion,
    fechaReferencia: refBase,
    fechaPago: cotizacion?.fechaPago,
  });
  if (!resultado) return null;
  // Se mantiene el nombre "monto" por compatibilidad con el resto del archivo.
  return {
    diasCobro:      resultado.diasCobro,
    porcentaje:     resultado.porcentaje,
    monto:          resultado.comision,
    subtotalSinIva: resultado.subtotalSinIva,
    esCalculado:    resultado.esCalculado,
    moneda:         resultado.moneda,      // moneda del documento (subtotalSinIva va en esta moneda)
    tipoCambio:     resultado.tipoCambio,  // 1 si MXN; TIPO_CAMBIO_USD si USD. `monto` ya está en MXN
  };
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

export function validarFiltrosRefacciones({ desde, hasta }) {
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

export function buildMatchRefacciones({ desde, hasta, asesorId, clienteId, buscar } = {}) {
  const match = {
    tipo:    "refacciones",
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

export async function obtenerRefaccionesFacturadas(filtros = {}) {
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

  const match = buildMatchRefacciones({ desde, hasta, asesorId, clienteId, buscar });

  // ── Conteo total ──────────────────────────────────────────────────────────
  const total = await Cotizacion.countDocuments(match);

  // ── Resumen agregado ─────────────────────────────────────────────────────
  const [agg] = await Cotizacion.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        refaccionesVendidas:  { $sum: 1 },
        subtotalComercial:  { $sum: { $ifNull: ["$subtotal", 0] } },
        ivaRegistrado:      { $sum: { $ifNull: ["$iva",      0] } },
        ventaComercialTotal:{ $sum: { $ifNull: ["$total",    0] } },
      },
    },
  ]);

  const sv  = numSeguro(agg?.refaccionesVendidas);
  const vct = numSeguro(agg?.ventaComercialTotal);

  const resumen = {
    refaccionesVendidas:    sv,
    // No aplica desglose adicional: en refacciones el "monto total" ya es
    // el valor de las piezas vendidas (items de la cotización).
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
        refaccionesVendidas:   { $sum: 1 },
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
    const sv2 = numSeguro(g.refaccionesVendidas);
    const vt  = numSeguro(g.ventaComercialTotal);
    return {
      asesorId:            g._id.asesorId    ?? null,
      asesorNombre:        g._id.asesorNombre ?? "Sin asesor asignado",
      refaccionesVendidas:   sv2,
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
    .select("_id folio tipo fecha fechaFacturada subtotal iva total moneda estatus numeroFactura fechaPago descripcionServicio items cliente clienteOcasional asesor equipoMarca equipoModelo equipoSerie")
    .populate("asesor",  "nombre")
    .populate("cliente", "nombre")
    .lean();

  const ESTADO_LABEL = { activa: "Activa", facturada: "Facturada", cancelada: "Cancelada" };

  const operaciones = docs.map(c => {
    const comisionFecha  = calcularFechaComision(c.fecha);
    const comisionCalc   = calcularComisionRefaccion(c);
    // subtotal/iva/total resueltos con fallback para documentos antiguos sin subtotal.
    const montos = resolverSubtotal(c);
    return {
      id:            `refaccion:${c._id}`,
      cotizacionId:  c._id,
      folio:         c.folio,
      fecha:          c.fecha          ?? null,
      fechaFacturada: c.fechaFacturada  ?? null,  // null en registros anteriores a este campo
      fechaCierre:    c.fechaFacturada ?? c.fecha ?? null,  // fecha de cierre/facturación para el reporte
      fechaReferencia: c.fechaFacturada ?? c.fecha ?? null,  // la que realmente se usa para comisión
      moneda:        c.moneda ?? "MXN",
      // Montos resueltos (con fallback si el documento antiguo solo tenía total con IVA)
      subtotal:      montos.subtotalSinIva,
      iva:           montos.iva,
      total:         montos.totalConIva,
      montoEsCalculado: montos.esCalculado,  // true si se dedujo el subtotal desde el total
      numeroFactura: c.numeroFactura ?? null,   // texto libre, no FK
      descripcion:   c.descripcionServicio ?? null,
      itemsCount:    c.items?.length ?? 0,
      equipoMarca:   c.equipoMarca  ?? null,
      equipoModelo:  c.equipoModelo ?? null,
      equipoSerie:   c.equipoSerie  ?? null,
      estatus:       c.estatus,
      estado:        ESTADO_LABEL[c.estatus] ?? c.estatus,
      // No disponible: el técnico pertenece al módulo operativo de Servicio.js,
      // no existe relación con Cotizacion. Ver limitaciones al final del reporte.
      tecnico:       null,
      // Comisión: segunda semana del mes siguiente a la fecha de la cotización
      fechaPagoComision: comisionFecha ? {
        inicio:   comisionFecha.inicio,
        fin:      comisionFecha.fin,
        etiqueta: comisionFecha.etiqueta,
      } : null,
      fechaPago: c.fechaPago ?? null,
      // Comisión calculada por días de cobro, SOBRE SUBTOTAL SIN IVA.
      // null si aún no se ha registrado la fecha de pago.
      comision: comisionCalc,
      // Campos explícitos pedidos por el reporte (mismo dato que `comision`, aplanado)
      porcentajeComision:      comisionCalc?.porcentaje ?? null,
      comisionAntesIva:        comisionCalc?.monto ?? null,
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

  // ── Comisión acumulada sobre TODO el filtro (no solo la página actual) ────
  // Se recorre el filtro completo (sin paginar) para que el total de comisión
  // sea correcto aunque haya más de `limit` resultados.
  const docsParaComision = await Cotizacion.find(match)
    .select("subtotal total fecha fechaFacturada fechaPago")
    .lean();

  let comisionAcumulada        = 0;
  let operacionesConPago       = 0;
  let operacionesSinPago       = 0;
  let subtotalAcumuladoTotal   = 0;
  let ivaAcumuladoTotal        = 0;
  let totalFacturadoAcumulado  = 0;

  for (const c of docsParaComision) {
    const montos = resolverSubtotal(c);
    subtotalAcumuladoTotal  = round2(subtotalAcumuladoTotal + montos.subtotalSinIva);
    ivaAcumuladoTotal       = round2(ivaAcumuladoTotal + montos.iva);
    totalFacturadoAcumulado = round2(totalFacturadoAcumulado + montos.totalConIva);

    const c2 = calcularComisionRefaccion(c);
    if (c2) {
      operacionesConPago++;
      comisionAcumulada = round2(comisionAcumulada + c2.monto);
    } else {
      operacionesSinPago++;
    }
  }

  const comisionResumen = {
    operacionesConPago,
    operacionesSinPago,
    montoTotalComisiones: comisionAcumulada,     // comisión acumulada de TODO el filtro
    subtotalAcumulado:    subtotalAcumuladoTotal,
    ivaAcumulado:          ivaAcumuladoTotal,
    totalFacturadoAcumulado,
    advertenciaMargen: "El % corresponde únicamente al plazo de cobro. El % final depende también del margen bruto según la política de comisiones vigente.",
  };

  return {
    resumen,
    porAsesor,
    operaciones,
    comisionResumen,
    paginacion: { page, limit, total, pages: Math.ceil(total / limit) },
    disponibilidad: {
      facturacionConciliada: false,  // numeroFactura es texto libre, sin FK
      cobranza:              false,
      saldo:                 false,
    },
    // Metadatos de la consulta para que el frontend pueda advertir al usuario
    meta: {
      fuenteFecha:   "cotizacion.fechaFacturada (fallback: cotizacion.fecha)",
      advertencia:   "El filtro de fechas usa la fecha de la cotización. La comisión se calcula sobre el subtotal SIN IVA (fallback aplicado si el documento solo tenía total con IVA).",
      manoObra:      "No disponible: los items de cotizaciones de servicio son texto libre sin categoría.",
      tecnico:       "No disponible: el técnico pertenece al módulo operativo de Servicio.js; Cotizacion no tiene relación con esa colección.",
    },
  };
}