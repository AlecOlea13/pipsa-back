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

const cotizacionSchema = new mongoose.Schema(
  {
    folio:        { type: String, required: true, trim: true, unique: true },
    tipo:         { type: String, enum: ["servicio", "renta", "venta", "refacciones"], required: true },
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
    estatus:      { type: String, enum: ["borrador", "enviada", "aceptada", "rechazada"], default: "borrador" },
    notas:        { type: String, trim: true },
    asesor:       { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", default: null },
    equipoMarca:  { type: String, trim: true, default: null },
    equipoModelo: { type: String, trim: true, default: null },
    equipoSerie:  { type: String, trim: true, default: null },
    comentarios:  [comentarioSchema],
  },
  { timestamps: true }
);

export default mongoose.model("Cotizacion", cotizacionSchema);