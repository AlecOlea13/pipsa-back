import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import ValeTorno from "../models/ValeTorno.js";

const router = Router();
const puedeAcceder = requireRol("developer", "gerencia", "almacen", "supervisor_almacen");

router.get("/", auth, puedeAcceder, async (req, res) => {
  try {
    const vales = await ValeTorno.find()
      .populate("firmadoPor", "nombre rol")
      .sort({ createdAt: -1 });
    res.json(vales);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", auth, puedeAcceder, async (req, res) => {
  try {
    const { items, notas } = req.body;
    if (!items?.length) return res.status(400).json({ message: "Agrega al menos un item" });

    const count = await ValeTorno.countDocuments();
    const folio = `TOR-${String(count + 1).padStart(3, "0")}`;

    const vale = await ValeTorno.create({
      folio,
      items,
      notas: notas || null,
      firmadoPor: req.userId,
    });

    const populated = await vale.populate("firmadoPor", "nombre rol");
    res.status(201).json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
});

export default router;