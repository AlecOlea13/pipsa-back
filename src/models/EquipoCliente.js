import mongoose from "mongoose";

/**
 * Equipos que pertenecen al CLIENTE (no son inventario de Pipsa).
 * Viven en su propia colección para no mezclarse con Montacargas
 * (inventario, rentas, ventas, comisiones).
 */
const equipoClienteSchema = new mongoose.Schema(
  {
    cliente:         { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", required: true },
    // Número/identificador con el que el cliente conoce su equipo (opcional)
    numeroEconomico: { type: String, trim: true, default: "" },
    marca:           { type: String, trim: true, default: "" },
    modelo:          { type: String, trim: true, default: "" },
    serie:           { type: String, trim: true, default: "" },
    tipo:            { type: String, enum: ["electrico", "gas", "diesel", ""], default: "" },
    capacidad:       { type: String, trim: true, default: "" },
    horometroActual: { type: Number, default: 0 },
    ubicacion:       { type: String, trim: true, default: "" }, // planta / sucursal
    notas:           { type: String, trim: true, default: "" },
    fotos:           { type: [String], default: [] },
    fechaUltimoServicio: { type: Date, default: null },
    activo:          { type: Boolean, default: true },
  },
  { timestamps: true }
);

equipoClienteSchema.index({ cliente: 1, activo: 1 });

export default mongoose.model("EquipoCliente", equipoClienteSchema);