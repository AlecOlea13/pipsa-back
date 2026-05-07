import { Router } from "express";
import { getFacturas, getFactura, createFactura, updateFactura, marcarPagada } from "../controllers/factura.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',                 auth, getFacturas);
router.get('/:id',              auth, getFactura);
router.post('/',                auth, createFactura);
router.put('/:id',              auth, updateFactura);
router.post('/:id/pagar',       auth, marcarPagada);

export default router;