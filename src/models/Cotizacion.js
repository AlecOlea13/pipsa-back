import mongoose from "mongoose";

const subconceptoSchema = new mongoose.Schema({
  descripcion: { type: String, trim: true },
  precio:      { type: Number, default: 0 },
}, { _id: false });

const itemSchema = new mongoose.Schema({
  cantidad:       { type: Number, required: true },
  descripcion:    { type: String, required: true, trim: true },
  precioUnitario: { type: Number, required: true },
  total:          { type: Number, required: true },
  imagen:         { type: String, default: null },
  subconceptos:   { type: [subconceptoSchema], default: [] },
}, { _id: false });

const comentarioSchema = new mongoose.Schema({
  texto:  { type: String, required: true, trim: true },
  autor:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fecha:  { type: Date, default: Date.now },
}, { _id: true });

const clienteOcasionalSchema = new mongoose.Schema({
  nombre:    { type: String, trim: true },
  direccion: { type: String, trim: true },
  telefono:  { type: String, trim: true },
  contacto:  { type: String, trim: true },
}, { _id: false });

// ── Nuevo: datos específicos del curso DC3 ──
const cursoDC3Schema = new mongoose.Schema({
  modalidad:          { type: String, enum: ["teorico", "practico", "teorico-practico"], default: "teorico-practico" },
  participantes:      { type: Number, default: 1 },
  precioPorPersona:   { type: Number, default: 0 },
  duracionHoras:      { type: Number, default: 4 },
  incluyeConstancia:  { type: Boolean, default: true },
  lugar:              { type: String, trim: true },
}, { _id: false });

const cotizacionSchema = new mongoose.Schema(
  {
    folio:        { type: String, required: true, trim: true, unique: true },
    tipo:         { type: String, enum: ["servicio", "renta", "venta", "refacciones", "curso"], required: true },
    tipoPeriodo:  { type: String, enum: ["semanal", "mensual", "anual"], default: null },
    cliente:      { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
    clienteOcasional: { type: clienteOcasionalSchema, default: null },
    montacargas:  { type: mongoose.Schema.Types.ObjectId, ref: "Montacargas" },
    fecha:        { type: Date, default: Date.now },
    lugar:        { type: String, trim: true, default: "Zapopán, Jal" },
    descripcionServicio: { type: String, trim: true },
    items:        [itemSchema],
    subtotal:     { type: Number, default: 0 },
    iva:          { type: Number, default: 0 },
    total:        { type: Number, default: 0 },
    condiciones:  { type: String, trim: true },
    moneda: { type: String, enum: ["MXN", "USD"], default: "MXN" },
    estatus: {
      type: String,
      enum: ["activa", "facturada", "cancelada"],
      default: "activa",
    },
    numeroFactura: { type: String, trim: true, default: null },
    notas:        { type: String, trim: true },
    asesor:       { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", default: null },
    equipoMarca:  { type: String, trim: true, default: null },
    equipoModelo: { type: String, trim: true, default: null },
    equipoSerie:  { type: String, trim: true, default: null },
    comentarios:  [comentarioSchema],
    // ── Nuevo ──
    cursoDC3:     { type: cursoDC3Schema, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("Cotizacion", cotizacionSchema);