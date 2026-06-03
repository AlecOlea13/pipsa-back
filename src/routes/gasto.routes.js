import { Router } from "express";
// import { getGastos, createGasto, updateGasto, deleteGasto } from "../controllers/gasto.controller.js";
import { auth, requireRol } from "../middleware/auth.js";
import { getGastos, createGasto, updateGasto, deleteGasto, pagarGasto } from "../controllers/gasto.controller.js";

const router = Router();
const canAccess = requireRol("developer", "gerencia", "oficina");

router.get("/",       auth, canAccess, getGastos);
router.post("/",      auth, canAccess, createGasto);
router.put("/:id",    auth, canAccess, updateGasto);
router.delete("/:id", auth, requireRol("developer", "gerencia"), deleteGasto);
router.post("/:id/pagar", auth, canAccess, pagarGasto);

export default router;