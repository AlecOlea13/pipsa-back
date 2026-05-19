import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  refaccion: { type: mongoose.Schema.Types.ObjectId, ref: "Refaccion", required: true },
  cantidad:  { type: Number, default: 1 },
}, { _id: false });

const catalogoEquipoSchema = new mongoose.Schema(
  {
    montacargas:  { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", required: true, unique: true },
    tipoServicio: { type: mongoose.Schema.Types.ObjectId, ref: "TipoServicio", default: null },
    refacciones:  [itemSchema], // sobreescribe las del tipo de servicio
    notas:        { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("CatalogoEquipo", catalogoEquipoSchema);