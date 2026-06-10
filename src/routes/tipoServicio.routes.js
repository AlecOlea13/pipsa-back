import { Router } from "express";
import { getTipos, createTipo, updateTipo, deleteTipo } from "../controllers/tipoServicio.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const rw = requireRol("developer", "gerencia", "oficina");

router.get("/",       auth, getTipos);
router.post("/",      auth, rw, createTipo);
router.put("/:id",    auth, rw, updateTipo);
router.delete("/:id", auth, rw, deleteTipo);

export default router;