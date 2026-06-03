import mongoose from "mongoose";

const conceptoSchema = new mongoose.Schema({
  descripcion:   { type: String, trim: true },
  cantidad:      { type: Number, default: 1 },
  valorUnitario: { type: Number, default: 0 },
  importe:       { type: Number, default: 0 },
}, { _id: false });

const gastoSchema = new mongoose.Schema(
  {
    uuid:           { type: String, trim: true, unique: true, sparse: true },
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
    asesor:         { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", default: null },
    notas:          { type: String, trim: true },
    xmlUrl:         { type: String, trim: true },
    // ── Pago ──
    estatus:        { type: String, enum: ["pendiente", "pagado"], default: "pendiente" },
    fechaPago:      { type: Date, default: null },
    comprobantePago:{ type: String, trim: true, default: null }, // URL Cloudinary
    complementoXml: { type: String, trim: true, default: null }, // URL o texto
  },
  { timestamps: true }
);

export default mongoose.model("Gasto", gastoSchema);