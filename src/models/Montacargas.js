import mongoose from "mongoose";

const montacargasSchema = new mongoose.Schema(
  {
    numeroEconomico:        { type: String, required: true, trim: true, unique: true },
    marca:                  { type: String, trim: true },
    modelo:                 { type: String, trim: true },
    serie:                  { type: String, trim: true },
    capacidad:              { type: String, trim: true },
    tipo:                   { type: String, enum: ["electrico", "gas", "diesel"] },
    alturaColapsada:        { type: String, trim: true },
    alturaLevante:          { type: String, trim: true },
    horquillas:             { type: String, trim: true },
    desplazadorLateral:     { type: Boolean, default: false },
    tipoLlantas:            { type: String, trim: true },
    voltaje:                { type: String, trim: true },
    tipoBateria:            { type: String, trim: true },
    incluyeCargador:        { type: Boolean, default: false },
    equipoSeguridad: {
      alarmaReversa:  { type: Boolean, default: false },
      torretaAmbar:   { type: Boolean, default: false },
      luces:          { type: Boolean, default: false },
      extintor:       { type: Boolean, default: false },
    },
    horometroActual:          { type: Number, default: 0 },
    horasRestantesServicio:   { type: Number, default: 0 },
    // ── "vendido" agregado: al marcarse así, el equipo sale del catálogo/filtros normales ──
    estatus:                  { type: String, enum: ["disponible", "rentado", "taller", "mantenimiento", "vendido"], default: "disponible" },
    clienteActual:            { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
    costoDia:     { type: Number, default: 0 },
    costoSemana:  { type: Number, default: 0 },
    costoMes:     { type: Number, default: 0 },
    costoAnual:   { type: Number, default: 0 },
    precioVenta:  { type: Number, default: 0 },
    fechaUltimoMantenimiento: { type: Date, default: null },
    proximoMantenimiento:     { type: Date, default: null },
    fechaUltimoServicio:      { type: Date, default: null },
    proximoServicio:          { type: Date, default: null },

    // ── Datos de la venta, solo se llenan cuando estatus === "vendido" ──
    venta: {
      fecha:          { type: Date, default: null },
      importe:        { type: Number, default: 0 }, // total real cobrado = facturado(+IVA) + efectivo
      montoFacturado: { type: Number, default: 0 }, // subtotal SIN IVA de la parte facturada
      ivaFacturado:   { type: Number, default: 0 }, // IVA calculado sobre montoFacturado (16%)
      numeroFactura:  { type: String, trim: true, default: "" }, // folio(s) de factura, ej. "A-1234" o "A-1234, A-1235"
      montoEfectivo:  { type: Number, default: 0 }, // parte no facturada
      cliente:        { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", default: null },
      clienteNombre:  { type: String, trim: true, default: "" }, // por si es cliente ocasional, sin catálogo
      asesor:         { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", default: null },
      notas:          { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Montacargas", montacargasSchema);