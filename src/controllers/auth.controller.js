import crypto from "node:crypto";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendVerificationEmail } from "../utils/mailer.js";

// ── Registro ──────────────────────────────────────────────────────────────────
export async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Por favor llena todos los campos" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "El usuario ya existe, carnal" });

    const hash        = await bcrypt.hash(password, 10);
    const verifyToken = crypto.randomBytes(32).toString("hex");

    const user = new User({
      name,
      email,
      password: hash,
      isVerified:        false,
      verifyToken,
      verifyTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    });
    await user.save();
    console.log("Token generado:", verifyToken);
console.log("Intentando mandar correo a:", email);
try {
  await sendVerificationEmail(email, verifyToken);
  console.log("Correo enviado OK");
} catch(err) {
  console.error("ERROR al mandar correo:", err.message);
}

    // Mandamos el correo (no bloqueamos la respuesta si falla)
    sendVerificationEmail(email, verifyToken).catch((err) =>
      console.error("Error enviando correo de verificación:", err.message)
    );

    res.status(201).json({
      message: "Cuenta creada. Revisa tu correo para verificarla antes de entrar.",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── Verificar email ───────────────────────────────────────────────────────────
export async function verifyEmail(req, res) {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ message: "Token requerido" });

    const user = await User.findOne({
  verifyToken: token,
      verifyTokenExpiry: { $gt: new Date() }, // no expirado
    });

    if (!user)
      return res.status(400).json({ message: "El enlace es inválido o ya expiró" });

    user.isVerified        = true;
    user.verifyToken       = null;
    user.verifyTokenExpiry = null;
    await user.save();

    res.json({ message: "¡Correo verificado! Ya puedes iniciar sesión." });
  } 
  catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email o contraseña incorrectos" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(404).json({ message: "Email o contraseña incorrectos" });

    // Bloquear login si no verificó el correo
    if (!user.isVerified)
      return res.status(403).json({
        message: "Verifica tu correo antes de entrar. Revisa tu bandeja de entrada.",
      });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || "changeme", {
      expiresIn: "7d",
    });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── Perfil ────────────────────────────────────────────────────────────────────
export async function profile(req, res) {
  const user = await User.findById(req.userId).select("_id name email");
  res.json({ user });
}
