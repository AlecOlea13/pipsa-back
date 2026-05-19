import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  refaccion:  { type: mongoose.Schema.Types.ObjectId, ref: "Refaccion", required: true },
  cantidad:   { type: Number, default: 1 },
}, { _id: false });

const tipoServicioSchema = new mongoose.Schema(
  {
    nombre:       { type: String, required: true, trim: true }, // "Preventivo 250hrs", "Correctivo", etc.
    descripcion:  { type: String, trim: true, default: null },
    intervaloHrs: { type: Number, default: null }, // 250, 500, null si no aplica
    refacciones:  [itemSchema],
    activo:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("TipoServicio", tipoServicioSchema);