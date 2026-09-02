import { Router } from "express";
import {
  getServicios, getServicio, createServicio, updateServicio,
  cerrarServicio, iniciarServicio, pausarServicio, reanudarServicio,
  getServiciosPorMontacargas,
} from "../controllers/servicio.controller.js";
import { auth } from "../middleware/auth.js";
import { requireRol } from "../middleware/auth.js";

const router = Router();

router.get('/',                              auth, getServicios);
router.get('/por-montacargas/:montacargasId', auth, getServiciosPorMontacargas);
router.get('/:id',                           auth, getServicio);
router.post('/',                             auth, createServicio);
router.put('/:id',                           auth, updateServicio);
router.post('/:id/iniciar',                  auth, iniciarServicio);
router.post('/:id/pausar',                   auth, pausarServicio);
router.post('/:id/reanudar',                 auth, reanudarServicio);
router.post('/:id/cerrar',                   auth, cerrarServicio);
router.delete("/:id", auth, requireRol("developer"), async (req, res) => {
  try {
    await Servicio.findByIdAndDelete(req.params.id);
    res.json({ message: "Eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
});

export default router;