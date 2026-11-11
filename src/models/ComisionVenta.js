/**
 * ComisionVenta.js  →  src/models/ComisionVenta.js
 *
 * Línea de comisión capturada por el vendedor (reemplaza el Excel).
 * Se precarga desde una venta de equipo / renta / cotización, pero los datos
 * se GUARDAN COPIADOS: si el origen cambia después, el reporte del mes no se mueve.
 * Todo es editable. La comisión es un monto en MXN que captura el vendedor.
 */
import mongoose from "mongoose";

const comisionVentaSchema = new mongoose.Schema(
  {
    tipo: { type: String, enum: ["equipo", "renta", "refacciones", "servicio", "otro"], required: true },

    // Origen (opcional: "otro" no tiene)
    origenRef: { type: String, enum: ["Montacargas", "Renta", "Cotizacion", null], default: null },
    origenId:  { type: mongoose.Schema.Types.ObjectId, default: null },

    referencia:  { type: String, trim: true, default: "" },   // # económico / folio
    descripcion: { type: String, trim: true, default: "" },
    factura:     { type: String, trim: true, default: "" },   // # de factura (editable)
    cliente:     { type: String, trim: true, default: "" },

    asesor:    { type: mongoose.Schema.Types.ObjectId, ref: "Asesor", required: true },
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true },

    fechaVenta: { type: Date, default: null },
    fechaPago:  { type: Date, default: null },
    periodo:    { type: String, required: true, match: /^\d{4}-\d{2}$/ }, // mes en que se comisiona

    moneda:     { type: String, enum: ["MXN", "USD"], default: "MXN" },
    subtotal:   { type: Number, default: 0 },   // SIN IVA, en la moneda original
    tipoCambio: { type: Number, default: 1 },
    dias:       { type: Number, default: 0 },
    porcentaje: { type: Number, default: 0 },
    comision:   { type: Number, default: 0 },   // MXN, la captura el vendedor

    notas: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

comisionVentaSchema.index({ periodo: 1, asesor: 1 });
comisionVentaSchema.index({ creadoPor: 1, periodo: 1 });

export default mongoose.model("ComisionVenta", comisionVentaSchema);