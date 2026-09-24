// ─────────────────────────────────────────────────────────────
//  Utilidades de cartera — zona horaria México
// ─────────────────────────────────────────────────────────────
const TZ = "America/Mexico_City";

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
 * Prioridad: fechaVencimiento explícita → diasCredito de factura → diasCredito de cliente.
 * Si no hay ninguno, devuelve null ("Vencimiento por definir").
 */
export function calcFechaVencimiento(factura, diasCreditoCliente) {
  if (factura.fechaVencimiento) return toMexDay(factura.fechaVencimiento);
  const plazo = factura.diasCredito ?? diasCreditoCliente ?? null;
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

/** Rango de antigüedad según días vencidos */
export function calcRango(diasVencidos, sinFechaVencimiento) {
  if (sinFechaVencimiento)  return "sin_definir";
  if (diasVencidos <= 0)    return "vigente";
  if (diasVencidos <= 30)   return "1_30";
  if (diasVencidos <= 60)   return "31_60";
  if (diasVencidos <= 90)   return "61_90";
  return "mas_90";
}

/** Estado calculado de la factura */
export function calcEstado(saldo, diasVencidos, sinFechaVencimiento, tienePagos) {
  if (saldo <= 0) return "PAGADA";
  if (sinFechaVencimiento) return "VENCIMIENTO_POR_DEFINIR";
  if (diasVencidos > 0) return tienePagos ? "PARCIAL_VENCIDA" : "VENCIDA";
  return tienePagos ? "PARCIAL_VIGENTE" : "VIGENTE";
}

/** Nivel de riesgo del cliente según máximo atraso */
export function calcRiesgo(maxDiasVencidos, sinFechaVencimiento) {
  if (sinFechaVencimiento) return "por_definir";
  if (maxDiasVencidos <= 0) return "bajo";
  if (maxDiasVencidos <= 30) return "medio";
  if (maxDiasVencidos <= 90) return "alto";
  return "critico";
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
      diasCredito:      doc.diasCredito ?? diasCreditoCliente ?? null,
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
      notas:            doc.notas ?? "",
      comentarios:      doc.comentarios ?? "",
    };
  });
}