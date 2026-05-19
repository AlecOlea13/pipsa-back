import mongoose from "mongoose";

const refaccionSchema = new mongoose.Schema(
  {
    nombre:       { type: String, required: true, trim: true },
    numeroParte:  { type: String, trim: true, default: null },
    categoria:    { type: String, trim: true, default: null },
    unidad:       { type: String, trim: true, default: "pieza" }, // pieza, litro, juego, etc.
    stock:        { type: Number, default: 0 },
    stockMinimo:  { type: Number, default: 1 },
    precio:       { type: Number, default: 0 },
    activo:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Refaccion", refaccionSchema);