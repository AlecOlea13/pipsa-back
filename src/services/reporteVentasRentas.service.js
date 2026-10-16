/**
 * reporteVentasRentas.service.js
 * Ruta en el proyecto: src/services/reporteVentasRentas.service.js
 *
 * Fuente: Renta con estatus="activa"
 * Identidad canónica: renta:{rentaId}
 *
 * REGLA DE NEGOCIO (confirmada con el usuario):
 * - Solo cuentan las rentas con estatus "activa". En cuanto pasan a
 *   "terminada" dejan de contar en este reporte. "vencida" tampoco cuenta
 *   como activa (ver mongoose enum del modelo: activa | vencida | terminada).
 * - Base de comisión = renta.precioMensual, que YA ES SIN IVA (confirmado).
 * - La comisión YA NO se calcula directo desde fechaInicio hasta "hoy".
 *   Ahora espera confirmación real de pago, igual que Equipos/Servicios/
 *   Refacciones: se busca un CuentaCobrar con ese rentaId vinculado y
 *   estatus "cobrada". Si existe, la comisión se calcula con la fecha real
 *   de pago (cxc.fechaPago) contra renta.fechaInicio. Si no existe ningún
 *   CxC pagada vinculada, la renta aparece como "Pendiente de pago" sin
 *   comisión calculada.
 * - El vínculo CxC↔Renta se guarda en CuentaCobrar.rentaId, detectado
 *   automáticamente al subir la factura por número económico (ver
 *   CuentasCobrar.tsx → saveCxc()).
 * - El filtro de fechas (desde/hasta) se aplica sobre fechaInicio.
 */

import mongoose    from "mongoose";
import Renta        from "../models/Renta.js";
import CuentaCobrar from "../models/CuentaCobrar.js";
import { calcularPorcentajePorDias, diasEntreFechas, round2, numSeguro } from "./comisiones.util.js";

function fechaLocalMX(str, esFinDelDia = false) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const fecha = new Date(y, mo - 1, d, esFinDelDia ? 23 : 0, esFinDelDia ? 59 : 0, esFinDelDia ? 59 : 0);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function validarFiltrosRentas({ desde, hasta }) {
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (desde && !fDesde) return { ok: false, mensaje: `Fecha "desde" inválida: "${desde}". Use formato YYYY-MM-DD.` };
  if (hasta && !fHasta) return { ok: false, mensaje: `Fecha "hasta" inválida: "${hasta}". Use formato YYYY-MM-DD.` };
  if (fDesde && fHasta && fDesde > fHasta) return { ok: false, mensaje: `Rango invertido: "desde" (${desde}) es posterior a "hasta" (${hasta}).` };
  return { ok: true };
}

export function buildMatchRentas({ asesorId, clienteId } = {}) {
  // NOTA: Rentas NO filtra por fecha. Una renta "activa" es una obligación
  // vigente HOY, sin importar cuándo inició el contrato — filtrar por
  // fechaInicio dentro de un rango excluía incorrectamente los contratos
  // antiguos que siguen vigentes. El selector de fechas en el frontend
  // para esta categoría queda solo de referencia visual, no se envía al
  // backend (ver reporteVentas.routes.js).
  const match = { estatus: "activa" };

  if (asesorId && mongoose.isValidObjectId(asesorId)) {
    match.asesor = new mongoose.Types.ObjectId(asesorId);
  }
  if (clienteId && mongoose.isValidObjectId(clienteId)) {
    match.cliente = new mongoose.Types.ObjectId(clienteId);
  }

  // "buscar" aquí no puede usar $or con folio (Renta no tiene folio) —
  // se filtra después del populate, no en el $match de Mongo.
  return match;
}

/**
 * Comisión de una renta: base = precioMensual (sin IVA), referencia = fechaInicio.
 * Requiere un CuentaCobrar vinculado (rentaId) y cobrado (estatus:"cobrada")
 * para poder calcularse. Sin eso, retorna null y el llamador debe mostrar
 * "Pendiente de pago".
 *
 * @param {object} renta  documento Renta (lean)
 * @param {object|null} cxcPagada  CuentaCobrar vinculado con estatus "cobrada", o null
 */
function calcularComisionRenta(renta, cxcPagada) {
  if (!renta?.fechaInicio) return null;
  if (!cxcPagada?.fechaPago) return null; // sin pago confirmado → no hay comisión aún

  const diasCobro  = diasEntreFechas(renta.fechaInicio, cxcPagada.fechaPago);
  const porcentaje = calcularPorcentajePorDias(diasCobro);
  const subtotalSinIva = numSeguro(renta.precioMensual);
  const monto = round2(subtotalSinIva * (porcentaje / 100));
  return {
    diasCobro,
    porcentaje,
    monto,
    subtotalSinIva,
    fechaPago: cxcPagada.fechaPago,
    cxcId: cxcPagada._id,
    folioFactura: cxcPagada.folioFactura ?? null,
  };
}

/**
 * Busca, para un conjunto de rentaIds, el CuentaCobrar "cobrada" más reciente
 * vinculado a cada una. Si una renta tiene varias facturas cobradas (meses
 * distintos), toma la de fechaPago más reciente como referencia del estado
 * de comisión vigente.
 */
async function mapaCxcPagadaPorRenta(rentaIds) {
  if (!rentaIds.length) return new Map();
  const cxcs = await CuentaCobrar.find({
    rentaId: { $in: rentaIds },
    estatus: "cobrada",
  })
    .select("rentaId fechaPago folioFactura total")
    .sort({ fechaPago: -1 })
    .lean();

  const mapa = new Map();
  for (const c of cxcs) {
    const key = String(c.rentaId);
    if (!mapa.has(key)) mapa.set(key, c); // ya viene ordenado desc, se queda con la más reciente
  }
  return mapa;
}

export async function obtenerRentasActivas(filtros = {}) {
  const {
    desde, hasta, asesorId, clienteId, buscar,
    page: rawPage = 1, limit: rawLimit = 20,
    sortBy: rawSortBy = "fechaInicio", sortDir: rawSortDir = "desc",
  } = filtros;

  const page  = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20));

  const SORT_WHITELIST = new Set(["fechaInicio", "fechaFin", "precioMensual"]);
  const sortField = SORT_WHITELIST.has(rawSortBy) ? rawSortBy : "fechaInicio";
  const sortDir   = rawSortDir === "asc" ? 1 : -1;

  const match = buildMatchRentas({ asesorId, clienteId });

  const total = await Renta.countDocuments(match);

  // ── Resumen agregado ─────────────────────────────────────────────────────
  const [agg] = await Renta.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        rentasActivas:     { $sum: 1 },
        subtotalComercial: { $sum: { $ifNull: ["$precioMensual", 0] } },
      },
    },
  ]);

  const ra  = numSeguro(agg?.rentasActivas);
  const sub = numSeguro(agg?.subtotalComercial);
  const iva = round2(sub * 0.16);

  const resumen = {
    rentasActivas: ra,
    subtotalComercial: sub,
    ivaRegistrado: iva,
    ventaComercialTotal: round2(sub + iva),
    ticketPromedio: ra > 0 ? round2(sub / ra) : 0,
  };

  // ── Por asesor ────────────────────────────────────────────────────────────
  const aggAsesor = await Renta.aggregate([
    { $match: match },
    {
      $group: {
        _id: { asesorId: "$asesor" },
        rentasActivas:     { $sum: 1 },
        subtotalComercial: { $sum: { $ifNull: ["$precioMensual", 0] } },
      },
    },
    {
      $lookup: {
        from: "asesors",
        localField: "_id.asesorId",
        foreignField: "_id",
        as: "_asesorDoc",
      },
    },
    { $addFields: { "_id.asesorNombre": { $ifNull: [{ $arrayElemAt: ["$_asesorDoc.nombre", 0] }, null] } } },
    { $project: { _asesorDoc: 0 } },
    { $sort: { subtotalComercial: -1 } },
  ]);

  const porAsesor = aggAsesor.map(g => {
    const ra2  = numSeguro(g.rentasActivas);
    const sub2 = numSeguro(g.subtotalComercial);
    const iva2 = round2(sub2 * 0.16);
    return {
      asesorId: g._id.asesorId ?? null,
      asesorNombre: g._id.asesorNombre ?? "Sin asesor asignado",
      rentasActivas: ra2,
      subtotalComercial: sub2,
      ivaRegistrado: iva2,
      ventaComercialTotal: round2(sub2 + iva2),
      ticketPromedio: ra2 > 0 ? round2(sub2 / ra2) : 0,
      participacion: sub > 0 ? round2((sub2 / sub) * 100) : 0,
    };
  });

  // ── Operaciones paginadas ────────────────────────────────────────────────
  let docsQuery = Renta.find(match)
    .sort({ [sortField]: sortDir })
    .populate("asesor", "nombre")
    .populate("cliente", "nombre")
    .populate("montacargas", "numeroEconomico marca modelo");

  let docs = await docsQuery.lean();

  // Filtro de búsqueda por texto (cliente / equipo), aplicado en memoria
  // porque Renta no tiene folio ni campos de texto libre indexables aquí.
  if (buscar?.trim()) {
    const q = buscar.trim().toLowerCase();
    docs = docs.filter(r =>
      (r.cliente?.nombre ?? "").toLowerCase().includes(q) ||
      (r.montacargas?.numeroEconomico ?? "").toLowerCase().includes(q) ||
      (r.montacargas?.marca ?? "").toLowerCase().includes(q)
    );
  }

  const totalFiltrado = docs.length;
  const docsPagina = docs.slice((page - 1) * limit, (page - 1) * limit + limit);

  // ── Vínculo con CxC pagada (comisión real solo si hay pago confirmado) ────
  const mapaCxc = await mapaCxcPagadaPorRenta(docs.map(r => r._id));

  const operaciones = docsPagina.map(r => {
    const cxcPagada = mapaCxc.get(String(r._id)) ?? null;
    const comisionCalc = calcularComisionRenta(r, cxcPagada);
    const subtotal = numSeguro(r.precioMensual);
    const iva3 = round2(subtotal * 0.16);
    return {
      id:            `renta:${r._id}`,
      rentaId:       r._id,
      fechaInicio:   r.fechaInicio ?? null,
      fechaFin:      r.fechaFin ?? null,
      tipoPeriodo:   r.tipoPeriodo,
      subtotal,
      iva: iva3,
      total: round2(subtotal + iva3),
      flete:    numSeguro(r.flete),
      deposito: numSeguro(r.deposito),
      estatus:  r.estatus,
      estado:   r.estatus === "activa" ? "Activa" : r.estatus === "vencida" ? "Vencida" : "Terminada",
      renovacionesCount: r.renovaciones?.length ?? 0,
      equipo: r.montacargas ? {
        id: r.montacargas._id,
        numeroEconomico: r.montacargas.numeroEconomico,
        marca: r.montacargas.marca,
        modelo: r.montacargas.modelo,
      } : null,
      cliente: r.cliente ? { id: r.cliente._id, nombre: r.cliente.nombre } : null,
      asesor:  r.asesor  ? { id: r.asesor._id, nombre: r.asesor.nombre }   : null,
      // Comisión real: solo existe si hay un CxC vinculado y cobrado.
      // Si cxcPagada es null, la renta está "Pendiente de pago".
      comision: comisionCalc,
      porcentajeComision: comisionCalc?.porcentaje ?? null,
      comisionAntesIva:   comisionCalc?.monto ?? null,
      estadoComision: comisionCalc ? "calculada" : "pendiente_pago",
    };
  });

  // ── Comisión acumulada sobre TODO el filtro (solo rentas con pago confirmado) ──
  let comisionAcumulada = 0;
  let operacionesConPago = 0;
  for (const r of docs) {
    const cxcPagada = mapaCxc.get(String(r._id)) ?? null;
    const c = calcularComisionRenta(r, cxcPagada);
    if (c) {
      comisionAcumulada = round2(comisionAcumulada + c.monto);
      operacionesConPago += 1;
    }
  }
  const operacionesSinPago = docs.length - operacionesConPago;

  const comisionResumen = {
    operacionesConPago,
    operacionesSinPago,
    montoTotalComisiones: comisionAcumulada,
    subtotalAcumulado: sub,
    ivaAcumulado: iva,
    totalFacturadoAcumulado: round2(sub + iva),
    advertenciaMargen: "El % corresponde al plazo entre el inicio de la renta y la fecha real de pago registrada en CxC. El % final depende también del margen bruto según la política de comisiones vigente.",
  };

  return {
    resumen,
    porAsesor,
    operaciones,
    comisionResumen,
    paginacion: { page, limit, total: totalFiltrado, pages: Math.ceil(totalFiltrado / limit) },
    disponibilidad: { facturacionConciliada: false, cobranza: false, saldo: false },
    meta: {
      fuenteFecha: "renta.fechaInicio",
      advertencia: "Solo se muestran rentas con estatus \"activa\". La comisión solo se calcula cuando existe una factura (CuentaCobrar) vinculada a la renta por número económico y ya marcada como cobrada; mientras no haya pago confirmado, la renta aparece como \"Pendiente de pago\".",
      manoObra: "No aplica a rentas.",
      tecnico: "No aplica a rentas.",
    },
  };
}