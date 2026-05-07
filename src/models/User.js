import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, trim: true, unique: true, lowercase: true },
    password:     { type: String, required: true },
    profileImage: { type: String, default: null },

    // ── Verificación de correo ──
    isVerified:        { type: Boolean, default: false },
    verifyToken:       { type: String, default: null },
    verifyTokenExpiry: { type: Date,   default: null },
  },
  { timestamps: true }
);

export default mongoose.model('User', userSchema);
