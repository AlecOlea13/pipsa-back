import { Router } from "express";
import {
  getServicios, getServicio, createServicio, updateServicio,
  cerrarServicio, iniciarServicio, pausarServicio, reanudarServicio,
  getServiciosPorMontacargas, eliminarServicio,
} from "../controllers/servicio.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();

router.get('/',                               auth, getServicios);
router.get('/por-montacargas/:montacargasId', auth, getServiciosPorMontacargas);
router.get('/:id',                            auth, getServicio);
router.post('/',                              auth, createServicio);
router.put('/:id',                            auth, requireRol("developer","gerencia","supervisor_almacen"), updateServicio);
router.post('/:id/iniciar',                   auth, iniciarServicio);
router.post('/:id/pausar',                    auth, pausarServicio);
router.post('/:id/reanudar',                  auth, reanudarServicio);
router.post('/:id/cerrar',                    auth, cerrarServicio);
router.delete('/:id',                         auth, requireRol("developer"), eliminarServicio);

export default router;