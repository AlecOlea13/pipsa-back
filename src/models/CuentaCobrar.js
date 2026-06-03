import mongoose from "mongoose";

const conceptoSchema = new mongoose.Schema({
  descripcion:   { type: String, trim: true },
  cantidad:      { type: Number, default: 1 },
  valorUnitario: { type: Number, default: 0 },
  importe:       { type: Number, default: 0 },
}, { _id: false });

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
    estatus:          { type: String, enum: ["pendiente", "cobrada"], default: "pendiente" },
    fechaPago:        { type: Date, default: null },
    complementoPago:  { type: String, trim: true, default: null },
    comentarios:      { type: String, trim: true, default: "" },
    notas:            { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("CuentaCobrar", cxcSchema);