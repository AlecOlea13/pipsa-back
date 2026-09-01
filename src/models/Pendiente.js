import mongoose from "mongoose";

const pendienteSchema = new mongoose.Schema(
  {
    servicio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Servicio",
      required: true,
    },
    montacargas: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Montacargas",
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cliente",
    },
    tecnico: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    descripcion: {
      type: String,
      required: true,
      trim: true,
    },
    resuelto: {
      type: Boolean,
      default: false,
    },
    fechaResuelto: {
      type: Date,
      default: null,
    },
    resueltoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Pendiente", pendienteSchema);