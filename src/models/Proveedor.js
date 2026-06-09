import mongoose from "mongoose";

const proveedorSchema = new mongoose.Schema(
  {
    nombre:   { type: String, trim: true, required: true },
    rfc:      { type: String, trim: true, default: null },
    email:    { type: String, trim: true, default: null },
    telefono: { type: String, trim: true, default: null },
    notas:    { type: String, trim: true, default: null },
    activo:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Proveedor", proveedorSchema);