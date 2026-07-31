import mongoose from "mongoose";

const conceptoSchema = new mongoose.Schema({
  descripcion:   { type: String, trim: true },
  cantidad:      { type: Number, default: 1 },
  valorUnitario: { type: Number, default: 0 },
  importe:       { type: Number, default: 0 },
}, { _id: false });

// ── Nuevo: historial de pagos parciales ──
const pagoSchema = new mongoose.Schema({
  monto:          { type: Number, required: true },
  fechaPago:      { type: Date, default: Date.now },
  complementoPago:{ type: String, trim: true, default: null },
  comentarios:    { type: String, trim: true, default: "" },
}, { timestamps: true });

const cxcSchema = new mongoose.Schema(
  {
    uuid:           { type: String, trim: true, unique: true, sparse: true },
    folioFactura:   { type: String, trim: true },
    fechaEmision:   { type: Date },
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

export default mongoose.model("CuentaCobrar", cxcSchema);