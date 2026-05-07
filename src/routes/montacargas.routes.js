import { Router } from "express";
import { getMontacargas, getMonta, createMonta, updateMonta, deleteMonta, asignarCliente, regresarMonta } from "../controllers/montacargas.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',                   auth, getMontacargas);
router.get('/:id',                auth, getMonta);
router.post('/',                  auth, createMonta);
router.put('/:id',                auth, updateMonta);
router.delete('/:id',             auth, deleteMonta);
router.post('/:id/asignar',       auth, asignarCliente);
router.post('/:id/regresar',      auth, regresarMonta);

export default router;