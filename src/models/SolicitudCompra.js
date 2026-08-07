import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  nombre:         { type: String, required: true },
  cantidad:       { type: Number, required: true, min: 1 },
  unidad:         { type: String, default: "pieza" },
  precioUnitario: { type: Number, default: 0 },
  precioEstimado: { type: Number, default: 0 },
  notas:          { type: String, default: "" },
}, { _id: false });

const solicitudCompraSchema = new mongoose.Schema({
  folio:           { type: String, unique: true },
  solicitadoPor:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  cotizacion:      { type: mongoose.Schema.Types.ObjectId, ref: "Cotizacion", default: null },
  items:           { type: [itemSchema], default: [] },
  notas:           { type: String, default: "" },
  moneda:          { type: String, enum: ["MXN", "USD"], default: "MXN" }, // ── NUEVO ──
  estatus:         { type: String, enum: ["sin_liberar", "liberada", "cancelada"], default: "sin_liberar" },
  liberadaPor:     { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  fechaLiberacion: { type: Date, default: null },
}, { timestamps: true });

solicitudCompraSchema.pre("save", async function () {
  if (!this.folio) {
    const count = await mongoose.model("SolicitudCompra").countDocuments();
    this.folio = `SOL-${String(count + 1).padStart(3, "0")}`;
  }
});

export default mongoose.model("SolicitudCompra", solicitudCompraSchema);