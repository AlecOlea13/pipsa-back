import mongoose from "mongoose";

const servicioSchema = new mongoose.Schema({
  fecha:       { type: Date, required: true },
  descripcion: { type: String, required: true, trim: true },
  km:          { type: Number, default: null },
  taller:      { type: String, trim: true, default: null },
  costo:       { type: Number, default: null },
}, { timestamps: true });

const vehiculoSchema = new mongoose.Schema(
  {
    numero:          { type: Number },
    marca:           { type: String, required: true, trim: true },
    modelo:          { type: String, required: true, trim: true },
    anio:            { type: Number },
    placa:           { type: String, trim: true },
    niv:             { type: String, trim: true },
    numeroMotor:     { type: String, trim: true },
    numTarjetaCirculacion: { type: String, trim: true },
    propietario:     { type: String, trim: true },
    operador:        { type: String, trim: true },
    agencia:         { type: String, trim: true },
    telefonos:       { type: String, trim: true },
    medidaLlanta:    { type: String, trim: true },

    // Fechas críticas
    vencimientoTC:      { type: Date, default: null },
    poliza:             { type: String, trim: true },
    vencimientoSeguro:  { type: Date, default: null },

    // Servicio
    proximoServicioKm:    { type: Number, default: null },
    proximoServicioFecha: { type: Date, default: null },
    kmActual:             { type: Number, default: null },

    historial: [servicioSchema],
    activo:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Vehiculo", vehiculoSchema);