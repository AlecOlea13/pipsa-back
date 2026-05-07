import { Router } from "express";
import { getRentas, getRenta, createRenta, updateRenta, cerrarRenta } from "../controllers/renta.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',             auth, getRentas);
router.get('/:id',          auth, getRenta);
router.post('/',            auth, createRenta);
router.put('/:id',          auth, updateRenta);
router.post('/:id/cerrar',  auth, cerrarRenta);

export default router;