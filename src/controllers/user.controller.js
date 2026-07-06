import User from "../models/User.js";
import bcrypt from "bcryptjs";

export async function getUsers(req, res) {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createUser(req, res) {
  try {
    const { username, password, nombre, rol, permisos } = req.body;
    if (!username || !password || !nombre || !rol)
      return res.status(400).json({ message: "Todos los campos son requeridos" });

    if (rol === "developer" && req.userRol !== "developer")
      return res.status(403).json({ message: "No tienes permiso para crear developers" });

    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(409).json({ message: "El usuario ya existe" });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({
      username: username.toLowerCase(),
      password: hash,
      nombre,
      rol,
      activo: true,
      permisos: permisos ?? [],
    });

    const obj = user.toObject();
    delete obj.password;
    res.status(201).json(obj);
  } catch (e) {
    console.error("ERROR createUser:", e.message, e.stack);
    res.status(500).json({ message: "Error en el servidor", detail: e.message });
  }
}

export async function updateUser(req, res) {
  try {
    const { username, nombre, rol, activo, password, permisos } = req.body;
    const updates = { nombre, rol, activo };

    if (username) updates.username = username.toLowerCase();
    if (password) updates.password = await bcrypt.hash(password, 12);
    if (permisos !== undefined) updates.permisos = permisos;

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteUser(req, res) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    if (user.rol === "developer")
      return res.status(403).json({ message: "No se puede eliminar al developer" });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Usuario eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}