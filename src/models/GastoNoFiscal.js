import mongoose from "mongoose";

const gastoNoFiscalSchema = new mongoose.Schema(
  {
    fecha:       { type: Date, required: true, default: Date.now },
    asesor:      { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", default: null },
    entrada:     { type: String, trim: true, default: "" },
    monto:       { type: Number, required: true, default: 0 },
    descripcion: { type: String, trim: true, required: true },
    notas:       { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("GastoNoFiscal", gastoNoFiscalSchema);