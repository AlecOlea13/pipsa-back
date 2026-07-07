import mongoose from "mongoose";

const itemValeSchema = new mongoose.Schema({
  refaccion: { type: mongoose.Schema.Types.ObjectId, ref: "Refaccion", required: true },
  nombre:    { type: String, required: true },
  numeroParte: { type: String, default: null },
  unidad:    { type: String, default: "pieza" },
  cantidad:  { type: Number, required: true },
}, { _id: false });

const valeSalidaSchema = new mongoose.Schema({
  folio:     { type: String, required: true, unique: true },
  tecnico:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items:     [itemValeSchema],
  notas:     { type: String, default: null },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model("ValeSalida", valeSalidaSchema);