import { Router } from "express";
import { auth } from "../middleware/auth.js";
import ValeSalida from "../models/ValeSalida.js";
import Refaccion from "../models/Refaccion.js";

const router = Router();

router.get("/", auth, async (req, res) => {
  try {
    const vales = await ValeSalida.find()
      .populate("tecnico", "nombre rol")
      .populate("registradoPor", "nombre")
      .sort({ createdAt: -1 });
    res.json(vales);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", auth, async (req, res) => {
  try {
    const { tecnicoId, items, notas } = req.body;
    if (!tecnicoId || !items?.length)
      return res.status(400).json({ message: "Técnico e items requeridos" });

    // Generar folio
    const count = await ValeSalida.countDocuments();
    const folio = `VAL-${String(count + 1).padStart(3, "0")}`;

    // Obtener info y descontar stock
    const itemsConInfo = await Promise.all(items.map(async (item) => {
      const ref = await Refaccion.findById(item.refaccionId);
      if (ref) {
        ref.stock = Math.max(0, ref.stock - item.cantidad);
        await ref.save();
      }
      return {
        refaccion:   item.refaccionId,
        nombre:      ref?.nombre ?? item.nombre,
        numeroParte: ref?.numeroParte ?? null,
        unidad:      ref?.unidad ?? "pieza",
        cantidad:    item.cantidad,
      };
    }));

    const vale = await ValeSalida.create({
      folio,
      tecnico:       tecnicoId,
      items:         itemsConInfo,
      notas:         notas || null,
      registradoPor: req.userId,
    });

    const populated = await vale.populate([
      { path: "tecnico", select: "nombre rol" },
      { path: "registradoPor", select: "nombre" },
    ]);

    res.status(201).json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
});

export default router;