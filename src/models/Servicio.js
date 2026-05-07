import mongoose from "mongoose";

const servicioSchema = new mongoose.Schema(
  {
    montacargas:      { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", required: true },
    cliente:          { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
    fechaReporte:     { type: Date, default: Date.now },
    problema:         { type: String, trim: true },
    tecnicoAsignado:  { type: String, trim: true },
    estatus:          { type: String, enum: ["abierto", "en_proceso", "cerrado"], default: "abierto" },
    costoRefacciones: { type: Number, default: 0 },
    costoManoObra:    { type: Number, default: 0 },
    horometro:        { type: Number, default: 0 },
    fotos:            [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("Servicio", servicioSchema);