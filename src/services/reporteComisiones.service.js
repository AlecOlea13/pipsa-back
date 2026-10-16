/**
 * reporteComisiones.service.js
 * Ruta en el proyecto: src/services/reporteComisiones.service.js
 *
 * Reporte unificado de comisiones: combina Equipos, Servicios, Refacciones
 * y Rentas, agrupado por asesor. Reutiliza los 4 services existentes para
 * no duplicar lógica de cálculo — este archivo solo orquesta y suma.
 *
 * Cada categoría conserva su propia regla de "qué cuenta":
 *   - Equipos:     Montacargas vendido → comisión 3% fija sobre el subtotal
 *                  facturado (se asume cobrado de inmediato, no requiere
 *                  fechaPago — ver reporteVentasEquipos.service.js).
 *   - Servicios:   Cotizacion tipo=servicio facturada, comisión requiere fechaPago.
 *   - Refacciones: Cotizacion tipo=refacciones facturada, comisión requiere fechaPago.
 *   - Rentas:      Renta activa, comisión requiere una CuentaCobrar vinculada
 *                  (rentaId) y cobrada; sin eso aparece "Pendiente de pago"
 *                  (ver reporteVentasRentas.service.js).
 */

import { obtenerEquiposVendidos }      from "./reporteVentasEquipos.service.js";
import { obtenerServiciosFacturados }  from "./reporteVentasServicios.service.js";
import { obtenerRefaccionesFacturadas} from "./reporteVentasRefacciones.service.js";
import { obtenerRentasActivas }        from "./reporteVentasRentas.service.js";
import { round2 } from "./comisiones.util.js";

function fechaLocalMX(str, esFinDelDia = false) {
  if (!str || typeof str !== "string") return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const fecha = new Date(y, mo - 1, d, esFinDelDia ? 23 : 0, esFinDelDia ? 59 : 0, esFinDelDia ? 59 : 0);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function validarFiltrosComisiones({ desde, hasta }) {
  const fDesde = desde ? fechaLocalMX(desde, false) : null;
  const fHasta = hasta ? fechaLocalMX(hasta, true)  : null;
  if (desde && !fDesde) return { ok: false, mensaje: `Fecha "desde" inválida: "${desde}".` };
  if (hasta && !fHasta) return { ok: false, mensaje: `Fecha "hasta" inválida: "${hasta}".` };
  if (fDesde && fHasta && fDesde > fHasta) return { ok: false, mensaje: `Rango invertido.` };
  return { ok: true };
}

/**
 * Trae el reporte de comisiones unificado por asesor, combinando las 4
 * fuentes. Usa limit alto en cada sub-reporte para traer TODAS las
 * operaciones del rango (no solo una página), ya que aquí solo nos importa
 * el acumulado de comisión por asesor y categoría, no el detalle paginado.
 */
export async function obtenerReporteComisiones(filtros = {}) {
  const { desde, hasta, asesorId } = filtros;
  const paramsComunes = { desde, hasta, asesorId, page: 1, limit: 10000 };

  const [equipos, servicios, refacciones, rentas] = await Promise.all([
    obtenerEquiposVendidos(paramsComunes).catch(() => null),
    obtenerServiciosFacturados(paramsComunes).catch(() => null),
    obtenerRefaccionesFacturadas(paramsComunes).catch(() => null),
    obtenerRentasActivas(paramsComunes).catch(() => null),
  ]);

  // ── Combinar por asesor ──────────────────────────────────────────────────
  const porAsesorMap = new Map();

  function getGrupo(asesorId, asesorNombre) {
    const key = asesorId ? String(asesorId) : "__sin_asesor__";
    if (!porAsesorMap.has(key)) {
      porAsesorMap.set(key, {
        asesorId: asesorId ?? null,
        asesorNombre: asesorNombre ?? "Sin asesor asignado",
        equipos:     { cantidad: 0, comision: 0 },
        servicios:   { cantidad: 0, comision: 0 },
        refacciones: { cantidad: 0, comision: 0 },
        rentas:      { cantidad: 0, comision: 0 },
        comisionTotal: 0,
      });
    }
    return porAsesorMap.get(key);
  }

  function acumularDesdeOperaciones(ops, categoria, getAsesor) {
    if (!ops) return;
    for (const op of ops) {
      const asesor = getAsesor(op);
      if (!asesor && !op.comision) continue; // sin asesor y sin comisión, no aporta nada relevante
      const grupo = getGrupo(asesor?.id, asesor?.nombre);
      if (op.comision) {
        grupo[categoria].cantidad++;
        grupo[categoria].comision = round2(grupo[categoria].comision + op.comision.monto);
        grupo.comisionTotal = round2(grupo.comisionTotal + op.comision.monto);
      }
    }
  }

  acumularDesdeOperaciones(equipos?.operaciones,     "equipos",     op => op.venta?.asesor);
  acumularDesdeOperaciones(servicios?.operaciones,   "servicios",   op => op.asesor);
  acumularDesdeOperaciones(refacciones?.operaciones, "refacciones", op => op.asesor);
  acumularDesdeOperaciones(rentas?.operaciones,      "rentas",      op => op.asesor);

  const porAsesor = [...porAsesorMap.values()].sort((a, b) => b.comisionTotal - a.comisionTotal);

  // ── Totales globales ──────────────────────────────────────────────────────
  const totales = {
    equipos:     { cantidad: 0, comision: 0 },
    servicios:   { cantidad: 0, comision: 0 },
    refacciones: { cantidad: 0, comision: 0 },
    rentas:      { cantidad: 0, comision: 0 },
    comisionTotal: 0,
  };
  for (const g of porAsesor) {
    for (const cat of ["equipos", "servicios", "refacciones", "rentas"]) {
      totales[cat].cantidad += g[cat].cantidad;
      totales[cat].comision = round2(totales[cat].comision + g[cat].comision);
    }
    totales.comisionTotal = round2(totales.comisionTotal + g.comisionTotal);
  }

  return {
    totales,
    porAsesor,
    disponibilidad: {
      equipos:     equipos     !== null,
      servicios:   servicios   !== null,
      refacciones: refacciones !== null,
      rentas:      rentas      !== null,
    },
    meta: {
      advertencia: "Equipos aplica 3% fijo (se asume cobrado al marcarse vendido). Servicios y Refacciones requieren fecha de pago registrada. Rentas requiere una factura (CxC) vinculada y cobrada — mientras no la haya, la renta aparece como \"Pendiente de pago\". El % final de cada operación depende también del margen bruto según la política vigente.",
    },
  };
}