import mongoose from "mongoose";

const pausaSchema = new mongoose.Schema({
  razon:      { type: String, trim: true, required: true },
  horaInicio: { type: Date, required: true },
  horaFin:    { type: Date, default: null },
}, { _id: true });

const servicioSchema = new mongoose.Schema(
  {
    folio:            { type: String, required: true, unique: true, trim: true },
    montacargas:      { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas", required: true },
    cliente:          { type: mongoose.Schema.Types.ObjectId, ref: "Cliente" },
    tipoServicio:     { type: mongoose.Schema.Types.ObjectId, ref: "TipoServicio", default: null },
    tecnicoAsignado:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    fechaReporte:     { type: Date, default: Date.now },
    problema:         { type: String, trim: true },
    estatus:          { type: String, enum: ["abierto", "en_proceso", "pausado", "cerrado"], default: "abierto" },
    costoRefacciones: { type: Number, default: 0 },
    costoManoObra:    { type: Number, default: 0 },
    horometro:        { type: Number, default: 0 },
    horometroCierre:  { type: Number, default: null },
    proximoServicio:  { type: Date, default: null },
    ordenRefaccion:   { type: mongoose.Schema.Types.ObjectId, ref: "OrdenRefaccion", default: null },
    notasCierre:      { type: String, trim: true, default: null },
    horaInicio:       { type: Date, default: null },
    horaFin:          { type: Date, default: null },
    pausas:           { type: [pausaSchema], default: [] },
    fotoHojaFirmada:  { type: String, default: null },
    fotoEquipoFinal:  { type: String, default: null },
    fotoRefacciones:  { type: String, default: null },
    fotos:            [{ type: String }],
  },
  { timestamps: true }
);

export default mongoose.model("Servicio", servicioSchema);