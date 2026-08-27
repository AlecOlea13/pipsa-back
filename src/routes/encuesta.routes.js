import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import {
  enviarEncuesta,
  getEncuestaPublica,
  responderEncuesta,
  getEncuestas,
  getEncuesta,
  getResumenEncuestas,
} from "../controllers/encuesta.controller.js";

const router = Router();

// ── Rutas PÚBLICAS (sin token) ────────────────────────────────────────────────
router.get("/responder/:token",  getEncuestaPublica);
router.post("/responder/:token", responderEncuesta);

// ── Rutas PRIVADAS ────────────────────────────────────────────────────────────
const rolesAdmin = ["developer", "gerencia", "oficina"];

router.get("/resumen", auth, requireRol(...rolesAdmin), getResumenEncuestas);
router.get("/",        auth, requireRol(...rolesAdmin), getEncuestas);
router.get("/:id",     auth, requireRol(...rolesAdmin), getEncuesta);
router.post("/enviar/:servicioId", auth, requireRol(...rolesAdmin), enviarEncuesta);

export default router;