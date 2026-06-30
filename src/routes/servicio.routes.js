import { Router } from "express";
import { getServicios, getServicio, createServicio, updateServicio, cerrarServicio, iniciarServicio } from "../controllers/servicio.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',             auth, getServicios);
router.get('/:id',          auth, getServicio);
router.post('/',            auth, createServicio);
router.put('/:id',          auth, updateServicio);
router.post('/:id/iniciar', auth, iniciarServicio);
router.post('/:id/cerrar',  auth, cerrarServicio);

export default router;