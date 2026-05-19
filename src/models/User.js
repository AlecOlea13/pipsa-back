import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    nombre:   { type: String, required: true, trim: true },
    rol:      { type: String, enum: ["developer", "gerencia", "oficina", "tecnico", "almacen"], required: true },
    activo:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);