// models/User.js — reemplaza con esto
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username:   { type: String, required: true, trim: true, unique: true, lowercase: true },
    password:   { type: String, required: true },
    nombre:     { type: String, required: true, trim: true },
    rol:        { type: String, enum: ["developer", "gerencia", "oficina", "tecnico", "almacen", "cliente"], required: true },
    activo:     { type: Boolean, default: true },
    permisos:   { type: [String], default: [] },
    clienteRef: { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);