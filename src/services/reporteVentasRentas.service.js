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
 * - La comisión se genera POR PAGO, no por renta: cada CuentaCobrar vinculada
 *   (rentaId) y "cobrada" comisiona su subtotal SIN IVA completo, aunque la
 *   factura cubra 2 o 3 meses por adelantado. Esa comisión cuenta en el MES
 *   EN QUE SE COBRÓ (cxc.fechaPago), no se reparte entre los meses cubiertos.
 * - % por días de cobro: fecha de emisión de la factura → fecha de pago
 *   (respaldo: renta.fechaInicio si la factura no trae fechaEmision).
 * - El filtro de fechas (desde/hasta) se aplica sobre cxc.fechaPago: la
 *   comisión de una renta en un rango es la suma de sus pagos cobrados dentro
 *   de ese rango. Una renta activa sin pagos en el rango aparece como
 *   "Pendiente de pago" (sin comisión en ese periodo).
 * - El vínculo CxC↔Renta se guarda en CuentaCobrar.rentaId, detectado
 *   automáticamente al subir la factura por número económico (ver
 *   CuentasCobrar.tsx → saveCxc()) o con el script de backfill.
 */

import mongoose    from "mongoose";
import Renta        from "../models/Renta.js";
import CuentaCobrar from "../models/CuentaCobrar.js";
import { calcularPorcentajePorDias, diasEntreFechas, resolverSubtotal, convertirAMXN, TIPO_CAMBIO_USD, round2, numSeguro } from "./comisiones.util.js";

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
 * Comisión de UN pago (una CuentaCobrar cobrada).
 * Base = subtotal SIN IVA de la factura (resolverSubtotal; respaldo total/1.16).
 * Días = fecha de emisión de la factura → fecha de pago.
 */
function calcularComisionPago(renta, cxc) {
  if (!cxc?.fechaPago) return null;
  const fechaReferencia = cxc.fechaEmision ?? renta?.fechaInicio;
  if (!fechaReferencia) return null;

  const diasCobro  = diasEntreFechas(fechaReferencia, cxc.fechaPago);
  const porcentaje = calcularPorcentajePorDias(diasCobro);
  const { subtotalSinIva } = resolverSubtotal(cxc);
  const moneda = String(cxc.moneda ?? "MXN").toUpperCase();
  const monto  = convertirAMXN(subtotalSinIva * (porcentaje / 100), moneda); // siempre MXN
  return {
    moneda,
    tipoCambio: moneda === "USD" ? TIPO_CAMBIO_USD : 1,
    cxcId: cxc._id,
    folioFactura: cxc.folioFactura ?? null,
    fechaFactura: fechaReferencia,
    fechaPago: cxc.fechaPago,
    diasCobro,
    porcentaje,
    subtotalSinIva,
    monto,
  };
}

/**
 * Comisión de una renta en el periodo = suma de la comisión de cada pago
 * cobrado dentro del periodo (ver mapaPagosPorRenta). Devuelve null si no hay
 * ningún pago → el llamador muestra "Pendiente de pago".
 *
 * `porcentaje` es el efectivo (monto total / base total); `pagos` trae el
 * detalle por factura.
 */
function calcularComisionRenta(renta, pagos) {
  const calculados = (pagos ?? []).map(p => calcularComisionPago(renta, p)).filter(Boolean);
  if (!calculados.length) return null;

  const monto = round2(calculados.reduce((a, p) => a + p.monto, 0));
  const base  = round2(calculados.reduce((a, p) => a + p.subtotalSinIva * p.tipoCambio, 0)); // base en MXN
  const ultimo = calculados.reduce((a, p) => (new Date(p.fechaPago) > new Date(a.fechaPago) ? p : a));
  return {
    diasCobro:      ultimo.diasCobro,
    porcentaje:     base > 0 ? round2((monto / base) * 100) : ultimo.porcentaje,
    monto,
    subtotalSinIva: base,
    fechaPago:      ultimo.fechaPago,
    cxcId:          ultimo.cxcId,
    folioFactura:   ultimo.folioFactura,
    pagosCount:     calculados.length,
    pagos:          calculados,
  };
}

/**
 * Pagos cobrados por renta. Trae TODAS las CuentaCobrar "cobrada" vinculadas
 * (rentaId) cuyo fechaPago cae dentro del rango [desde, hasta] (si se dan).
 * Cada una comisiona por separado en el mes en que se cobró.
 */
async function mapaPagosPorRenta(rentaIds, desde, hasta) {
  if (!rentaIds.length) return new Map();
  const filtro = { rentaId: { $in: rentaIds }, estatus: "cobrada", fechaPago: { $ne: null } };
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (fDesde || fHasta) {
    filtro.fechaPago = {};
    if (fDesde) filtro.fechaPago.$gte = fDesde;
    if (fHasta) filtro.fechaPago.$lte = fHasta;
  }
  const cxcs = await CuentaCobrar.find(filtro)
    .select("rentaId fechaEmision fechaPago folioFactura subtotal iva total moneda")
    .sort({ fechaPago: 1 })
    .lean();

  const mapa = new Map();
  for (const c of cxcs) {
    const key = String(c.rentaId);
    if (!mapa.has(key)) mapa.set(key, []);
    mapa.get(key).push(c);
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
  const mapaCxc = await mapaPagosPorRenta(docs.map(r => r._id), desde, hasta);

  const operaciones = docsPagina.map(r => {
    const pagosRenta   = mapaCxc.get(String(r._id)) ?? [];
    const comisionCalc = calcularComisionRenta(r, pagosRenta);
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
      // Comisión del periodo: suma de los pagos (CxC cobradas) dentro del rango.
      // Sin pagos en el rango → "Pendiente de pago".
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
    const c = calcularComisionRenta(r, mapaCxc.get(String(r._id)) ?? []);
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
    advertenciaMargen: "Cada pago cobrado comisiona su subtotal sin IVA completo en el mes en que se cobró (aunque cubra varios meses por adelantado). El % corresponde al plazo entre la emisión de la factura y su pago. El % final depende también del margen bruto según la política de comisiones vigente.",
  };

  return {
    resumen,
    porAsesor,
    operaciones,
    comisionResumen,
    paginacion: { page, limit, total: totalFiltrado, pages: Math.ceil(totalFiltrado / limit) },
    disponibilidad: { facturacionConciliada: false, cobranza: false, saldo: false },
    meta: {
      fuenteFecha: "cuentaCobrar.fechaPago",
      advertencia: "Solo se muestran rentas con estatus \"activa\". La comisión se genera por cada factura (CuentaCobrar) vinculada a la renta y marcada como cobrada, sobre su subtotal sin IVA, en el mes en que se cobró (cxc.fechaPago, filtrada por el rango de fechas). Si la renta no tiene pagos en el periodo, aparece como \"Pendiente de pago\".",
      manoObra: "No aplica a rentas.",
      tecnico: "No aplica a rentas.",
    },
  };
}