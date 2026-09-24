import mongoose from "mongoose";

const conceptoSchema = new mongoose.Schema({
  descripcion:   { type: String, trim: true },
  cantidad:      { type: Number, default: 1 },
  valorUnitario: { type: Number, default: 0 },
  importe:       { type: Number, default: 0 },
}, { _id: false });

const pagoSchema = new mongoose.Schema({
  monto:           { type: Number, required: true },
  fechaPago:       { type: Date, default: Date.now },
  complementoPago: { type: String, trim: true, default: null },
  comentarios:     { type: String, trim: true, default: "" },
}, { timestamps: true });

const cxcSchema = new mongoose.Schema(
  {
    uuid:           { type: String, trim: true, unique: true, sparse: true },
    folioFactura:   { type: String, trim: true },
    fechaEmision:   { type: Date },

    // ── NUEVO: vencimiento ──────────────────────────────────────────
    fechaVencimiento: { type: Date, default: null },   // explícita desde el CFDI o captura manual
    diasCredito:      { type: Number, default: null },  // plazo de esta factura en particular

    rfcEmisor:      { type: String, trim: true },
    nombreEmisor:   { type: String, trim: true },
    rfcReceptor:    { type: String, trim: true },
    nombreReceptor: { type: String, trim: true },
    conceptos:      [conceptoSchema],
    subtotal:       { type: Number, default: 0 },
    iva:            { type: Number, default: 0 },
    total:          { type: Number, default: 0 },
    moneda:         { type: String, default: "MXN" },
    // Cobro
    estatus:         { type: String, enum: ["pendiente", "parcial", "cobrada", "cancelada"], default: "pendiente" },
    montoPagado:     { type: Number, default: 0 },
    fechaPago:       { type: Date, default: null },
    complementoPago: { type: String, trim: true, default: null },
    comentarios:     { type: String, trim: true, default: "" },
    notas:           { type: String, trim: true, default: "" },
    pagos:           [pagoSchema],
  },
  { timestamps: true }
);

// Índices para cartera (no modifican datos existentes)
cxcSchema.index({ estatus: 1 });
cxcSchema.index({ nombreReceptor: 1 });
cxcSchema.index({ rfcReceptor: 1 });
cxcSchema.index({ fechaEmision: -1 });
cxcSchema.index({ fechaVencimiento: 1 });
cxcSchema.index({ estatus: 1, nombreReceptor: 1 });

export default mongoose.model("CuentaCobrar", cxcSchema);