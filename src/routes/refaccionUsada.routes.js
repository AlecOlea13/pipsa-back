import { Router } from "express";
import { getRefaccionesUsadas, createRefaccionUsada, deleteRefaccionUsada } from "../controllers/refaccionUsada.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();

router.get("/",       auth, getRefaccionesUsadas);
router.post("/",      auth, createRefaccionUsada);
router.delete("/:id", auth, requireRol("developer", "gerencia"), deleteRefaccionUsada);

export default router;