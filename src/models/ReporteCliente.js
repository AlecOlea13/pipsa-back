// models/ReporteCliente.js
import mongoose from "mongoose";

const reporteClienteSchema = new mongoose.Schema({
  folio:      { type: String, required: true, unique: true },
  cliente:    { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", required: true },
  creadoPor:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  montacargas:{ type: mongoose.Schema.Types.ObjectId, ref: "Montacargas" },
  descripcion:{ type: String, required: true, trim: true },
  foto:       { type: String, default: null },
  estatus:    { type: String, enum: ["abierto", "en_proceso", "cerrado"], default: "abierto" },
  notaInterna:{ type: String, default: "" },
}, { timestamps: true });

export default mongoose.model("ReporteCliente", reporteClienteSchema);