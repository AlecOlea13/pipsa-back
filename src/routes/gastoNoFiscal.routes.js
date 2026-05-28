import { Router } from "express";
import {
  getGastosNoFiscales, createGastoNoFiscal,
  updateGastoNoFiscal, deleteGastoNoFiscal,
} from "../controllers/gastoNoFiscal.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const canAccess = requireRol("developer", "gerencia", "oficina");

router.get("/",       auth, canAccess, getGastosNoFiscales);
router.post("/",      auth, canAccess, createGastoNoFiscal);
router.put("/:id",    auth, canAccess, updateGastoNoFiscal);
router.delete("/:id", auth, canAccess, deleteGastoNoFiscal);

export default router;