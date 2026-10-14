/**
 * reporteCotizaciones.service.js
 * Ruta en el proyecto: src/services/reporteCotizaciones.service.js
 *
 * Reporte general de Cotizaciones por asesor — incluye TODOS los tipos
 * (servicio, renta, venta, refacciones, curso) y los 3 estatus
 * (activa, facturada, cancelada).
 *
 * La comisión solo se calcula sobre cotizaciones FACTURADAS, usando la
 * misma base y tabla de porcentajes que el resto del sistema
 * (comisiones.util.js) — nunca sobre total con IVA.
 */

import mongoose   from "mongoose";
import Cotizacion from "../models/Cotizacion.js";
import { resolverSubtotal, calcularComision, round2, numSeguro } from "./comisiones.util.js";

/** Convierte "YYYY-MM-DD" a Date local; null si inválido. */
function fechaLocalMX(str, esFinDelDia = false) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const fecha = new Date(y, mo - 1, d, esFinDelDia ? 23 : 0, esFinDelDia ? 59 : 0, esFinDelDia ? 59 : 0);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function validarFiltrosReporte({ desde, hasta }) {
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (desde && !fDesde) return { ok: false, mensaje: `Fecha "desde" inválida: "${desde}".` };
  if (hasta && !fHasta) return { ok: false, mensaje: `Fecha "hasta" inválida: "${hasta}".` };
  if (fDesde && fHasta && fDesde > fHasta) return { ok: false, mensaje: `Rango invertido.` };
  return { ok: true };
}

function buildMatch({ desde, hasta, asesorId, tipo }) {
  const match = {};
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (fDesde || fHasta) {
    match.fecha = {};
    if (fDesde) match.fecha.$gte = fDesde;
    if (fHasta) match.fecha.$lte = fHasta;
  }
  if (asesorId && mongoose.isValidObjectId(asesorId)) {
    match.asesor = new mongoose.Types.ObjectId(asesorId);
  }
  if (tipo && ["servicio", "renta", "venta", "refacciones", "curso"].includes(tipo)) {
    match.tipo = tipo;
  }
  return match;
}

/**
 * Reporte general por asesor: cuenta y suma activas, facturadas y
 * canceladas de TODOS los tipos de cotización, con comisión solo
 * sobre las facturadas.
 */
export async function obtenerReportePorAsesor(filtros = {}) {
  const { desde, hasta, asesorId, tipo } = filtros;
  const match = buildMatch({ desde, hasta, asesorId, tipo });

  // Traemos solo los campos necesarios — puede ser un volumen alto (todas las cotizaciones del rango)
  const docs = await Cotizacion.find(match)
    .select("folio tipo fecha fechaFacturada subtotal iva total estatus fechaPago asesor cliente clienteOcasional numeroFactura")
    .populate("asesor", "nombre")
    .populate("cliente", "nombre")
    .lean();

  // ── Agrupar por asesor ──────────────────────────────────────────────────
  const porAsesorMap = new Map();

  function getGrupo(asesorId, asesorNombre) {
    const key = asesorId ? String(asesorId) : "__sin_asesor__";
    if (!porAsesorMap.has(key)) {
      porAsesorMap.set(key, {
        asesorId: asesorId ?? null,
        asesorNombre: asesorNombre ?? "Sin asesor asignado",
        activas:    { cantidad: 0, subtotal: 0, iva: 0, total: 0 },
        facturadas: { cantidad: 0, subtotal: 0, iva: 0, total: 0, comision: 0 },
        canceladas: { cantidad: 0, subtotal: 0, iva: 0, total: 0 },
        totalGeneral: { cantidad: 0, subtotal: 0, iva: 0, total: 0 },
      });
    }
    return porAsesorMap.get(key);
  }

  const operaciones = [];

  for (const c of docs) {
    const grupo = getGrupo(c.asesor?._id, c.asesor?.nombre);
    const montos = resolverSubtotal(c);

    const bucket =
      c.estatus === "facturada" ? grupo.facturadas :
      c.estatus === "cancelada" ? grupo.canceladas :
      grupo.activas; // "activa"

    bucket.cantidad++;
    bucket.subtotal = round2(bucket.subtotal + montos.subtotalSinIva);
    bucket.iva      = round2(bucket.iva + montos.iva);
    bucket.total    = round2(bucket.total + montos.totalConIva);

    grupo.totalGeneral.cantidad++;
    grupo.totalGeneral.subtotal = round2(grupo.totalGeneral.subtotal + montos.subtotalSinIva);
    grupo.totalGeneral.iva      = round2(grupo.totalGeneral.iva + montos.iva);
    grupo.totalGeneral.total    = round2(grupo.totalGeneral.total + montos.totalConIva);

    let comision = null;
    if (c.estatus === "facturada") {
      const refBase = c.fechaFacturada ?? c.fecha;
      comision = calcularComision({ doc: c, fechaReferencia: refBase, fechaPago: c.fechaPago });
      if (comision) {
        grupo.facturadas.comision = round2(grupo.facturadas.comision + comision.comision);
      }
    }

    operaciones.push({
      id:        `cot:${c._id}`,
      folio:     c.folio,
      tipo:      c.tipo,
      fecha:     c.fecha ?? null,
      estatus:   c.estatus,
      subtotal:  montos.subtotalSinIva,
      iva:       montos.iva,
      total:     montos.totalConIva,
      numeroFactura: c.numeroFactura ?? null,
      cliente: c.cliente
        ? { id: c.cliente._id, nombre: c.cliente.nombre }
        : c.clienteOcasional?.nombre
          ? { id: null, nombre: c.clienteOcasional.nombre }
          : null,
      asesor: c.asesor
        ? { id: c.asesor._id, nombre: c.asesor.nombre }
        : null,
      comision: comision ? { porcentaje: comision.porcentaje, monto: comision.comision, diasCobro: comision.diasCobro } : null,
    });
  }

  const porAsesor = [...porAsesorMap.values()]
    .sort((a, b) => b.totalGeneral.total - a.totalGeneral.total);

  // ── Totales globales (suma de todos los asesores) ──────────────────────
  const totales = {
    activas:    { cantidad: 0, subtotal: 0, iva: 0, total: 0 },
    facturadas: { cantidad: 0, subtotal: 0, iva: 0, total: 0, comision: 0 },
    canceladas: { cantidad: 0, subtotal: 0, iva: 0, total: 0 },
  };
  for (const g of porAsesor) {
    for (const key of ["activas", "facturadas", "canceladas"]) {
      totales[key].cantidad += g[key].cantidad;
      totales[key].subtotal = round2(totales[key].subtotal + g[key].subtotal);
      totales[key].iva      = round2(totales[key].iva + g[key].iva);
      totales[key].total    = round2(totales[key].total + g[key].total);
    }
    totales.facturadas.comision = round2(totales.facturadas.comision + g.facturadas.comision);
  }

  return {
    totales,
    porAsesor,
    operaciones,
    meta: {
      advertencia: "La comisión se calcula únicamente sobre cotizaciones facturadas, usando subtotal sin IVA. El % varía según días de cobro (requiere fechaPago registrada).",
    },
  };
}