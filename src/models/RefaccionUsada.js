import mongoose from "mongoose";

const refaccionUsadaSchema = new mongoose.Schema(
  {
    servicio:     { type: mongoose.Schema.Types.ObjectId, ref: "Servicio", default: null },
    montacargas:  { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", default: null },
    descripcion:  { type: String, trim: true, required: true },
    numeroParte:  { type: String, trim: true, default: null },
    condicion:    { type: String, enum: ["desgastada", "rota", "quemada", "corroida", "otro"], default: "desgastada" },
    fotos:        [{ type: String }],
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    notas:        { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("RefaccionUsada", refaccionUsadaSchema);