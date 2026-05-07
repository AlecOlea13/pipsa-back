import mongoose from "mongoose";

const rentaSchema = new mongoose.Schema(
  {
    cliente:      { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", required: true },
    montacargas:  { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", required: true },
    fechaInicio:  { type: Date, required: true },
    fechaFin:     { type: Date, default: null },
    precioMensual:{ type: Number, required: true },
    flete:        { type: Number, default: 0 },
    deposito:     { type: Number, default: 0 },
    estatus:      { type: String, enum: ["activa", "vencida", "terminada"], default: "activa" },
    contratoPDF:  { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Renta", rentaSchema);