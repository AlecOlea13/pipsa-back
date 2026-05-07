import mongoose from "mongoose";

const facturaSchema = new mongoose.Schema(
  {
    cliente:        { type: mongoose.Schema.Types.ObjectId, ref: "Cliente", required: true },
    renta:          { type: mongoose.Schema.Types.ObjectId, ref: "Renta" },
    monto:          { type: Number, required: true },
    fechaVencimiento: { type: Date, required: true },
    pagado:         { type: Boolean, default: false },
    diasVencidos:   { type: Number, default: 0 },
    comentarios:    { type: String, trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Factura", facturaSchema);