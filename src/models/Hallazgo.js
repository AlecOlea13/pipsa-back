// models/Hallazgo.js
import mongoose from "mongoose";

const versionSchema = new mongoose.Schema({
  version:    { type: Number, required: true },
  url:        { type: String, required: true },
  nombre:     { type: String, required: true },
  tipo:       { type: String, required: true }, // "application/pdf", "image/jpeg", etc
  nota:       { type: String, default: "" },
  subidoPor:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  fecha:      { type: Date, default: Date.now },
}, { _id: true });

const hallazgoSchema = new mongoose.Schema({
  clave:          { type: String, required: true, unique: true }, // "NC_01", "NC_02", etc
  numero:         { type: Number, required: true },
  nombre:         { type: String, required: true },
  descripcion:    { type: String, required: true },
  clasificacion:  { type: String, enum: ["mayor", "menor"], required: true },
  proceso:        { type: String, required: true },
  documentos:     { type: [versionSchema], default: [] },
}, { timestamps: true });

export default mongoose.model("Hallazgo", hallazgoSchema);