/**
 * comisiones.util.js
 * Ruta en el proyecto: src/services/comisiones.util.js
 *
 * Única fuente de verdad para calcular comisiones en todo el sistema.
 * Regla de negocio: la comisión SIEMPRE se calcula sobre el subtotal SIN IVA,
 * nunca sobre el total con IVA. El % varía según la tabla de días de cobro
 * (ver calcularPorcentajePorDias), pero la base es siempre subtotalSinIva.
 */

const TASA_IVA = 0.16;

/** Redondea a 2 decimales de forma segura (evita errores de punto flotante). */
export function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/** Devuelve v como número finito, o 0 si no lo es. */
export function numSeguro(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Resuelve el subtotal sin IVA de un registro, con fallback para
 * documentos antiguos que solo tengan total con IVA.
 *
 * Prioridad:
 *   1. Si el documento trae `subtotal` numérico y mayor a 0, se usa tal cual.
 *   2. Si no hay subtotal pero sí `total` (con IVA), se calcula:
 *        subtotalSinIva = totalConIva / (1 + TASA_IVA)
 *   3. Si no hay ninguno de los dos, regresa 0.
 *
 * No modifica el documento original — es un cálculo de solo lectura
 * para efectos de reporte.
 *
 * @param {{ subtotal?: number, total?: number }} doc
 * @param {number} tasaIva - tasa de IVA a usar en el fallback (default 0.16)
 * @returns {{ subtotalSinIva: number, iva: number, totalConIva: number, esCalculado: boolean }}
 */
export function resolverSubtotal(doc, tasaIva = TASA_IVA) {
  const subtotalDoc = numSeguro(doc?.subtotal);
  const totalDoc     = numSeguro(doc?.total);
  const ivaDoc        = numSeguro(doc?.iva);

  if (subtotalDoc > 0) {
    // Caso normal: el documento ya trae subtotal confiable
    const iva = ivaDoc > 0 ? ivaDoc : round2(subtotalDoc * tasaIva);
    const total = totalDoc > 0 ? totalDoc : round2(subtotalDoc + iva);
    return {
      subtotalSinIva: round2(subtotalDoc),
      iva:            round2(iva),
      totalConIva:    round2(total),
      esCalculado:    false,
    };
  }

  if (totalDoc > 0) {
    // Fallback: registro antiguo sin subtotal — se calcula hacia atrás desde el total
    const subtotalCalculado = round2(totalDoc / (1 + tasaIva));
    const ivaCalculado      = round2(totalDoc - subtotalCalculado);
    return {
      subtotalSinIva: subtotalCalculado,
      iva:            ivaCalculado,
      totalConIva:    round2(totalDoc),
      esCalculado:    true,
    };
  }

  // Sin datos suficientes
  return { subtotalSinIva: 0, iva: 0, totalConIva: 0, esCalculado: false };
}

/**
 * Determina el porcentaje de comisión aplicable según los días transcurridos
 * entre la fecha de facturación y la fecha de pago.
 *
 *   0–30 días  → 3.0%
 *   31–60 días → 2.0%
 *   61–90 días → 1.0%
 *   > 90 días  → 0.0% (requiere autorización de Dirección)
 *
 * @param {number} diasCobro
 * @returns {number} porcentaje (0, 1, 2 o 3)
 */
export function calcularPorcentajePorDias(diasCobro) {
  if (diasCobro <= 30) return 3.0;
  if (diasCobro <= 60) return 2.0;
  if (diasCobro <= 90) return 1.0;
  return 0.0;
}

/**
 * Calcula días de cobro entre dos fechas, evitando desfase UTC
 * (parsea ambas como fecha local antes de restar).
 *
 * @param {Date|string} fechaReferencia - fecha de facturación / cotización
 * @param {Date|string} fechaPago
 * @returns {number} días (puede ser negativo si fechaPago es anterior)
 */
export function diasEntreFechas(fechaReferencia, fechaPago) {
  function fechaLocalMs(d) {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
  }
  return Math.floor((fechaLocalMs(fechaPago) - fechaLocalMs(fechaReferencia)) / (1000 * 60 * 60 * 24));
}

/**
 * Función central de comisión — ÚNICA fuente de verdad para todo el sistema.
 *
 * Base de cálculo: subtotal SIN IVA (resuelto con fallback si hace falta).
 * Porcentaje: según tabla de días de cobro.
 *
 * @param {object} params
 * @param {{ subtotal?: number, total?: number }} params.doc - documento con subtotal/total
 * @param {Date|string|null} params.fechaReferencia - fecha de facturación
 * @param {Date|string|null} params.fechaPago - fecha en que se cobró
 * @returns {{
 *   diasCobro: number,
 *   porcentaje: number,
 *   subtotalSinIva: number,
 *   comision: number,
 *   esCalculado: boolean
 * } | null}  null si falta fechaReferencia o fechaPago
 */
export function calcularComision({ doc, fechaReferencia, fechaPago }) {
  if (!fechaReferencia || !fechaPago) return null;

  const diasCobro  = diasEntreFechas(fechaReferencia, fechaPago);
  const porcentaje = calcularPorcentajePorDias(diasCobro);
  const { subtotalSinIva, esCalculado } = resolverSubtotal(doc);
  const comision = round2(subtotalSinIva * (porcentaje / 100));

  return { diasCobro, porcentaje, subtotalSinIva, comision, esCalculado };
}