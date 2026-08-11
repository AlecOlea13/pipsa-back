import mongoose from "mongoose";

const productoFiscalSchema = new mongoose.Schema({
  claveSAT:    { type: String, required: true },
  claveUnidad: { type: String, required: true, default: "E48" },
  unidad:      { type: String, default: "Unidad de servicio" },
  descripcion: { type: String, required: true },
  activo:      { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("ProductoFiscal", productoFiscalSchema);