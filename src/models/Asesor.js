import mongoose from "mongoose";

const asesorSchema = new mongoose.Schema(
  {
    nombre:   { type: String, required: true, trim: true },
    puesto:   { type: String, trim: true, default: "Asesor comercial" },
    telefono: { type: String, trim: true },
    email:    { type: String, trim: true, lowercase: true },
    activo:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Asesor", asesorSchema);