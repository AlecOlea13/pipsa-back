// ─────────────────────────────────────────────────────────────
//  Utilidades de cartera — zona horaria México
// ─────────────────────────────────────────────────────────────
const TZ = "America/Mexico_City";

/** Plazo de crédito (días) cuando ni la factura ni el cliente lo traen: se cuenta desde la fecha de emisión.
 *  Configurable con la variable de entorno CARTERA_DIAS_CREDITO_DEFAULT. */
export const DIAS_CREDITO_DEFAULT = Number.isFinite(Number(process.env.CARTERA_DIAS_CREDITO_DEFAULT))
  && process.env.CARTERA_DIAS_CREDITO_DEFAULT !== undefined && process.env.CARTERA_DIAS_CREDITO_DEFAULT !== ""
  ? Number(process.env.CARTERA_DIAS_CREDITO_DEFAULT) : 30;

/** Plazo efectivo: factura → cliente → default. */
export function plazoEfectivo(factura, diasCreditoCliente) {
  return factura.diasCredito ?? diasCreditoCliente ?? DIAS_CREDITO_DEFAULT;
}

/** Convierte una fecha (Date|string) al inicio del día en México */
export function toMexDay(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d)) return null;
  // Serializar en fecha local México y volver a construir como medianoche UTC-aware
  const str = d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
  const [y, m, day] = str.split("-").map(Number);
  return new Date(y, m - 1, day); // fecha local sin hora
}

/** Diferencia en días enteros (fechaB - fechaA) */
export function diffDays(fechaA, fechaB) {
  const a = toMexDay(fechaA);
  const b = toMexDay(fechaB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Calcula la fecha de vencimiento de una factura.
 * Prioridad: fechaVencimiento explícita → diasCredito de factura → diasCredito de cliente
 * → plazo por defecto (DIAS_CREDITO_DEFAULT), siempre contado desde la fecha de emisión.
 * Solo devuelve null ("Vencimiento por definir") si la factura no tiene fecha de emisión.
 */
export function calcFechaVencimiento(factura, diasCreditoCliente) {
  if (factura.fechaVencimiento) return toMexDay(factura.fechaVencimiento);
  const plazo = plazoEfectivo(factura, diasCreditoCliente);
  if (plazo !== null && factura.fechaEmision) {
    const base = toMexDay(factura.fechaEmision);
    if (base) {
      const result = new Date(base);
      result.setDate(result.getDate() + plazo);
      return result;
    }
  }
  return null;
}

/** Saldo pendiente con tolerancia de redondeo (< $0.005 → 0) */
export function calcSaldo(total, montoPagado) {
  const saldo = (total ?? 0) - (montoPagado ?? 0);
  return saldo < 0.005 && saldo > -0.005 ? 0 : Math.max(0, saldo);
}

/** Rango de antigüedad según días vencidos.
 *  Política: los primeros 30 días post-vencimiento se consideran VIGENTE (tolerancia).
 *  De 31 a 60 días → POR_VENCER (advertencia).
 *  Más de 60 días  → VENCIDA (1–30d, 31–60d, +60d).
 */
export function calcRango(diasVencidos, sinFechaVencimiento) {
  if (sinFechaVencimiento)  return "sin_definir";
  if (diasVencidos <= 0)    return "vigente";       // no ha vencido aún
  if (diasVencidos <= 30)   return "vigente";       // tolerancia 1er mes
  if (diasVencidos <= 60)   return "por_vencer";    // advertencia 2do mes
  if (diasVencidos <= 90)   return "vencida_30";    // vencida 1–30 días
  if (diasVencidos <= 120)  return "vencida_60";    // vencida 31–60 días
  return "mas_60";                                  // vencida +60 días
}

/** Antigüedad en columnas (días contados desde la EMISIÓN de la factura, sobre todo el saldo):
 *  1–30 · 31–60 · 61–90 · 91+. (vigente/sinDef se conservan en 0 por compatibilidad.) */
export const AGING_KEYS = ["vigente", "d1_30", "d31_60", "d61_90", "d91", "sinDef"];
export function emptyAging() {
  return { vigente: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91: 0, sinDef: 0, total: 0 };
}
export function bucketAging(f) {
  const d = f.diasTranscurridos ?? 0;
  if (d <= 30)  return "d1_30";
  if (d <= 60)  return "d31_60";
  if (d <= 90)  return "d61_90";
  return "d91";
}
export function sumAging(facturas) {
  const a = emptyAging();
  for (const f of facturas) { a[bucketAging(f)] += f.saldo; a.total += f.saldo; }
  return a;
}

/** Estado calculado de la factura.
 *  Vencida = más de 60 días después del vencimiento.
 */
export function calcEstado(saldo, diasVencidos, sinFechaVencimiento, tienePagos) {
  if (saldo <= 0) return "PAGADA";
  if (sinFechaVencimiento) return "VENCIMIENTO_POR_DEFINIR";
  if (diasVencidos > 60) return tienePagos ? "PARCIAL_VENCIDA" : "VENCIDA";
  if (diasVencidos > 30) return tienePagos ? "PARCIAL_POR_VENCER" : "POR_VENCER";
  return tienePagos ? "PARCIAL_VIGENTE" : "VIGENTE";
}

/** Nivel de riesgo del cliente según máximo atraso.
 *  Alineado con la política: vencida real = >60 días.
 */
export function calcRiesgo(maxDiasVencidos, sinFechaVencimiento) {
  if (sinFechaVencimiento) return "por_definir";
  if (maxDiasVencidos <= 30) return "bajo";      // tolerancia
  if (maxDiasVencidos <= 60) return "medio";     // por vencer
  if (maxDiasVencidos <= 120) return "alto";     // vencida reciente
  return "critico";                               // vencida grave
}

/**
 * Enriquece un array de documentos CuentaCobrar con todos los campos calculados.
 * fechaCorte: Date (día México, hora 00:00 local)
 * diasCreditoCliente: número | null
 */
export function enriquecerFacturas(docs, fechaCorte, diasCreditoCliente) {
  return docs.map(doc => {
    const saldo         = calcSaldo(doc.total, doc.montoPagado);
    const fv            = calcFechaVencimiento(doc, diasCreditoCliente);
    const sinFecha      = fv === null;
    const diasTransc    = diffDays(doc.fechaEmision, fechaCorte) ?? 0;
    const diasVencidos  = sinFecha ? 0 : Math.max(0, diffDays(fv, fechaCorte) ?? 0);
    const diasParaVencer = sinFecha ? null : Math.max(0, diffDays(fechaCorte, fv) ?? 0);
    const tienePagos    = (doc.montoPagado ?? 0) > 0;
    const rango         = calcRango(diasVencidos, sinFecha);
    const estado        = calcEstado(saldo, diasVencidos, sinFecha, tienePagos);
    const ultimoPago    = doc.pagos?.length
      ? doc.pagos.reduce((a, b) => (a.fechaPago > b.fechaPago ? a : b)).fechaPago
      : (doc.fechaPago ?? null);

    return {
      _id:              doc._id,
      uuid:             doc.uuid ?? null,
      folioFactura:     doc.folioFactura ?? null,
      fechaEmision:     doc.fechaEmision ?? null,
      fechaVencimiento: fv,
      diasCredito:      plazoEfectivo(doc, diasCreditoCliente),
      plazoPorDefecto:  !doc.fechaVencimiento && doc.diasCredito == null && diasCreditoCliente == null,
      total:            doc.total ?? 0,
      montoPagado:      doc.montoPagado ?? 0,
      saldo,
      diasTranscurridos: diasTransc,
      diasVencidos,
      diasParaVencer,
      sinFechaVencimiento: sinFecha,
      rango,
      estado,
      ultimoPago,
      nombreReceptor:   doc.nombreReceptor ?? null,
      rfcReceptor:      doc.rfcReceptor ?? null,
      moneda:           doc.moneda ?? "MXN",
      subtotal:         doc.subtotal ?? 0,
      iva:              doc.iva ?? 0,
      conceptos:        (doc.conceptos ?? []).map(c => ({
        descripcion: c.descripcion ?? "", cantidad: c.cantidad ?? 1, importe: c.importe ?? 0,
      })),
      notas:            doc.notas ?? "",
      comentarios:      doc.comentarios ?? "",
    };
  });
}