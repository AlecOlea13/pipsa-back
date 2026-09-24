import mongoose from "mongoose";

const clienteSchema = new mongoose.Schema(
  {
    nombre:           { type: String, required: true, trim: true },
    contacto:         { type: String, trim: true },
    telefono:         { type: String, trim: true },
    email:            { type: String, trim: true, lowercase: true },
    direccion:        { type: String, trim: true },
    condicionesPago:  { type: String, trim: true },

    // ── NUEVO: plazo de crédito en días (default para nuevas facturas) ──
    diasCredito:      { type: Number, default: null },

    estatus:          { type: String, enum: ["activo", "inactivo"], default: "activo" },
    // Datos fiscales
    razonSocial:      { type: String, trim: true },
    rfc:              { type: String, trim: true },
    regimenFiscal:    { type: String, trim: true },
    usoCFDI:          { type: String, trim: true },
    direccionFiscal:  { type: String, trim: true },
    codigoPostal:     { type: String, trim: true },
    emailFiscal:      { type: String, trim: true, lowercase: true },
  },
  { timestamps: true }
);

clienteSchema.index({ rfc: 1 });

export default mongoose.model("Cliente", clienteSchema);