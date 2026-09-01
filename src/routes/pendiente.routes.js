import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import {
  getPendientes, crearPendientes, marcarResuelto, reabrirPendiente, eliminarPendiente,
} from "../controllers/pendiente.controller.js";

const router = Router();

router.get("/", auth, getPendientes);
router.post("/", auth, crearPendientes);
router.put("/:id/resolver", auth, marcarResuelto);
router.put("/:id/reabrir", auth, requireRol("developer", "gerencia", "supervisor_almacen"), reabrirPendiente);
router.delete("/:id", auth, requireRol("developer", "gerencia"), eliminarPendiente);

export default router;