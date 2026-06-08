import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  refaccion: { type: mongoose.Schema.Types.ObjectId, ref: "Refaccion", required: true },
  cantidad:  { type: Number, default: 1 },
}, { _id: false });

const tipoServicioSchema = new mongoose.Schema(
  {
    nombre:        { type: String, required: true, trim: true },
    descripcion:   { type: String, trim: true, default: null },
    intervaloHrs:  { type: Number, default: null },
    itemsChecklist:{ type: [String], default: [] }, // lo que se checa
    precioTotal:   { type: Number, default: 0 },    // gran total del servicio
    refacciones:   [itemSchema],
    activo:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("TipoServicio", tipoServicioSchema);