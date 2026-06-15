import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import {
  getGastos,
  createGasto,
  updateGasto,
  deleteGasto,
  pagarGasto,
  cancelarGasto,
  pagarGastoMultiple,
} from "../controllers/gasto.controller.js";

const router = Router();
const canAccess = requireRol("developer", "gerencia", "oficina");
const canCancel = requireRol("developer", "gerencia", "oficina");

router.get("/",               auth, canAccess, getGastos);
router.post("/",              auth, canAccess, createGasto);
router.post("/pagar-multiple",auth, canAccess, pagarGastoMultiple);
router.put("/:id",            auth, canAccess, updateGasto);
router.delete("/:id",         auth, requireRol("developer", "gerencia"), deleteGasto);
router.post("/:id/pagar",     auth, canAccess, pagarGasto);
router.post("/:id/cancelar",  auth, canCancel, cancelarGasto);

export default router;