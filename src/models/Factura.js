import mongoose from "mongoose";

const facturaSchema = new mongoose.Schema({
  folio:          { type: String },
  serie:          { type: String, default: "M" },
  uuid:           { type: String, unique: true, sparse: true },
  tipo:           { type: String, enum: ["factura", "rep", "nota_credito"], default: "factura" },
  estatus:        { type: String, enum: ["vigente", "cancelada", "pendiente"], default: "vigente" },
  estatusPago:    { type: String, enum: ["sin_pago", "parcial", "pagada", "no_aplica"], default: "sin_pago" },
  moneda:         { type: String, default: "MXN" },
  tipoCambio:     { type: Number, default: null },
  subtotal:       { type: Number, default: 0 },
  descuentos:     { type: Number, default: 0 },
  total:          { type: Number, default: 0 },
  totalPagado:    { type: Number, default: 0 },
  receptor: {
    rfc:           { type: String },
    nombre:        { type: String },
    regimenFiscal: { type: String },
    usoCfdi:       { type: String },
    cp:            { type: String },
  },
  metodoPago:     { type: String, default: "PUE" },
  formaPago:      { type: String, default: "03" },
  condicionesPago:{ type: String, default: "" },
  fechaEmision:   { type: Date, default: Date.now },
  fechaVencimiento:{ type: Date, default: null },
  partidas: [{
    cantidad:       { type: Number },
    claveUnidad:    { type: String },
    unidad:         { type: String },
    claveProdServ:  { type: String },
    descripcion:    { type: String },
    valorUnitario:  { type: Number },
    importe:        { type: Number },
    descuento:      { type: Number, default: 0 },
    objetoDeImpuesto: { type: String, default: "02" },
  }],
  urlPdf:         { type: String, default: null },
  urlXml:         { type: String, default: null },
  urlQr:          { type: String, default: null },
  notas:          { type: String, default: "" },
  // Referencia al cliente de Control Pipsa
  clientePipsa:   { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
  // Para REPs — factura que pagan
  facturaRelacionada: { type: mongoose.Schema.Types.ObjectId, ref: "Factura", default: null },
  creadoPor:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

export default mongoose.model("Factura", facturaSchema);