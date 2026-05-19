import mongoose from "mongoose";

const itemOrdenSchema = new mongoose.Schema({
  refaccion:          { type: mongoose.Schema.Types.ObjectId, ref: "Refaccion", required: true },
  cantidadSolicitada: { type: Number, required: true },
  cantidadSurtida:    { type: Number, default: 0 },
  confirmado:         { type: Boolean, default: false },
}, { _id: false });

const ordenRefaccionSchema = new mongoose.Schema(
  {
    folio:        { type: String, required: true, unique: true, trim: true },
    servicio:     { type: mongoose.Schema.Types.ObjectId, ref: "Servicio", required: true },
    montacargas:  { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", required: true },
    items:        [itemOrdenSchema],
    estatus:      { type: String, enum: ["pendiente", "surtida", "parcial", "cancelada"], default: "pendiente" },
    notas:        { type: String, trim: true, default: null },
    surtidoPor:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fechaSurtido: { type: Date, default: null },
    // ── Fotos de evidencia de refacciones viejas ──
    fotosEvidencia: [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("OrdenRefaccion", ordenRefaccionSchema);