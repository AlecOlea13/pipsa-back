import express from "express";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Obtener perfil
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo usuario" });
  }
});

// Actualizar nombre
router.put("/me", auth, async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    user.name = name;
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Error actualizando nombre" });
  }
});

// Subir imagen de perfil → Cloudinary
router.post(
  "/me/photo",
  auth,
  upload.single("image"),
  async (req, res) => {
    try {
      const user = await User.findById(req.userId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

      // req.file.path es la URL de Cloudinary
      user.profileImage = req.file.path;
      await user.save();

      res.json(user);
    } catch (error) {
      console.error("Error subiendo imagen:", error);
      res.status(500).json({ message: "Error subiendo imagen" });
    }
  }
);

export default router;