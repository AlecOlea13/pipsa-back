import mongoose from "mongoose";

const portalSchema = new mongoose.Schema(
  {
    nombre:    { type: String, required: true, trim: true },
    url:       { type: String, trim: true, default: "" },
    usuario:   { type: String, trim: true, default: "" },
    password:  { type: String, trim: true, default: "" },
    notas:     { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Portal", portalSchema);