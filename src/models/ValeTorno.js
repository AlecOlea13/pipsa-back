import mongoose from "mongoose";

const itemTornoSchema = new mongoose.Schema({
  descripcion: { type: String, required: true, trim: true },
  cantidad:    { type: Number, default: 1 },
  unidad:      { type: String, default: "pieza" },
  notas:       { type: String, default: null },
}, { _id: false });

const valeTornoSchema = new mongoose.Schema({
  folio:      { type: String, required: true, unique: true },
  items:      [itemTornoSchema],
  notas:      { type: String, default: null },
  firmadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export default mongoose.model("ValeTorno", valeTornoSchema);