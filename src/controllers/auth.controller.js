import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: "Usuario y contraseña requeridos" });

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Usuario o contraseña incorrectos" });

    if (!user.activo)
      return res.status(403).json({ message: "Tu cuenta está desactivada, contacta al administrador" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Usuario o contraseña incorrectos" });

    const token = jwt.sign(
      { id: user._id, rol: user.rol, nombre: user.nombre },
      process.env.JWT_SECRET || "changeme",
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: { id: user._id, username: user.username, nombre: user.nombre, rol: user.rol },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function profile(req, res) {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}
