import mongoose from "mongoose";

const montacargasSchema = new mongoose.Schema(
  {
    numeroEconomico:  { type: String, required: true, trim: true, unique: true },
    marca:            { type: String, trim: true },
    modelo:           { type: String, trim: true },
    serie:            { type: String, trim: true },
    capacidad:        { type: String, trim: true },
    tipo:             { type: String, enum: ["electrico", "combustiòn"] },
    horometroActual:  { type: Number, default: 0 },
    estatus:          { type: String, enum: ["disponible", "rentado", "taller", "mantenimiento"], default: "disponible" },
    clienteActual:    { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
    rentaMensual:     { type: Number, default: 0 },
    fechaUltimoServicio: { type: Date, default: null },
    proximoServicio:     { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Montacargas", montacargasSchema);