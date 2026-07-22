import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import SolicitudCompra from "../models/SolicitudCompra.js";

const router = Router();

const puedeCrear  = requireRol("developer", "gerencia", "oficina", "almacen", "supervisor_almacen");
const puedeLiberar = requireRol("developer", "gerencia");

// GET — developer/gerencia ven todo; almacen/supervisor_almacen solo liberadas
router.get("/", auth, async (req, res) => {
  try {
    const rol = req.userRol;
    const puedeVerTodo = ["developer", "gerencia"].includes(rol);
    const puedeVerAlgo = ["almacen", "supervisor_almacen", "oficina"].includes(rol);

    if (!puedeVerTodo && !puedeVerAlgo) {
      return res.status(403).json({ message: "Sin acceso" });
    }

    const filtro = puedeVerTodo ? {} : { estatus: "liberada" };

    const solicitudes = await SolicitudCompra.find(filtro)
      .populate("solicitadoPor", "nombre rol")
      .populate("liberadaPor", "nombre")
      .sort({ createdAt: -1 });

    res.json(solicitudes);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST — crear solicitud
router.post("/", auth, puedeCrear, async (req, res) => {
  try {
    const { items, notas } = req.body;
    if (!items?.length) return res.status(400).json({ message: "Agrega al menos un artículo" });

    const sol = new SolicitudCompra({
      solicitadoPor: req.userId,
      items,
      notas: notas || "",
    });
    await sol.save();
    await sol.populate("solicitadoPor", "nombre rol");
    res.status(201).json(sol);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /:id/liberar — solo developer/gerencia
router.post("/:id/liberar", auth, puedeLiberar, async (req, res) => {
  try {
    const sol = await SolicitudCompra.findById(req.params.id);
    if (!sol) return res.status(404).json({ message: "No encontrada" });
    if (sol.estatus === "liberada") return res.status(400).json({ message: "Ya está liberada" });

    sol.estatus        = "liberada";
    sol.liberadaPor    = req.userId;
    sol.fechaLiberacion = new Date();
    await sol.save();
    await sol.populate(["solicitadoPor", "liberadaPor"]);
    res.json(sol);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST /:id/cancelar — solo developer/gerencia
router.post("/:id/cancelar", auth, puedeLiberar, async (req, res) => {
  try {
    const sol = await SolicitudCompra.findById(req.params.id);
    if (!sol) return res.status(404).json({ message: "No encontrada" });
    sol.estatus = "cancelada";
    await sol.save();
    res.json(sol);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// DELETE /:id — solo developer
router.delete("/:id", auth, requireRol("developer"), async (req, res) => {
  try {
    await SolicitudCompra.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;