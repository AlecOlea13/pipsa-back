import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  nombre:         { type: String, required: true },
  cantidad:       { type: Number, required: true, min: 1 },
  unidad:         { type: String, default: "pieza" },
  precioEstimado: { type: Number, default: 0 },
  notas:          { type: String, default: "" },
}, { _id: false });

const solicitudCompraSchema = new mongoose.Schema({
  folio:        { type: String, unique: true },
  solicitadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items:        { type: [itemSchema], default: [] },
  notas:        { type: String, default: "" },
  estatus:      { type: String, enum: ["sin_liberar", "liberada", "cancelada"], default: "sin_liberar" },
  liberadaPor:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  fechaLiberacion: { type: Date, default: null },
}, { timestamps: true });

solicitudCompraSchema.pre("save", async function (next) {
  if (!this.folio) {
    const count = await mongoose.model("SolicitudCompra").countDocuments();
    this.folio = `SOL-${String(count + 1).padStart(3, "0")}`;
  }
  next();
});

export default mongoose.model("SolicitudCompra", solicitudCompraSchema);