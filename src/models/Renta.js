import mongoose from "mongoose";

const renovacionSchema = new mongoose.Schema({
  fechaFinAnterior:   { type: Date, default: null },
  precioMensualAnterior: { type: Number, default: 0 },
  fechaFinNueva:      { type: Date, required: true },
  precioMensualNuevo: { type: Number, required: true },
  fechaRenovacion:    { type: Date, default: Date.now },
  notas:              { type: String, trim: true, default: "" },
}, { _id: true });

const rentaSchema = new mongoose.Schema(
  {
    cliente:      { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", required: true },
    montacargas:  { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", required: true },
    asesor:       { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", default: null },
    fechaInicio:  { type: Date, required: true },
    fechaFin:     { type: Date, default: null },
    tipoPeriodo:  { type: String, enum: ["semanal", "mensual", "anual"], default: "mensual" },
    precioMensual:{ type: Number, required: true },
    flete:        { type: Number, default: 0 },
    deposito:     { type: Number, default: 0 },
    estatus:      { type: String, enum: ["activa", "vencida", "terminada"], default: "activa" },
    contratoPDF:  { type: String, default: null },
    renovaciones: { type: [renovacionSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("Renta", rentaSchema);