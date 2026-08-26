import { Router } from "express";
import { verifyToken, checkRol } from "../middleware/auth.js";
import {
  enviarEncuesta,
  getEncuestaPublica,
  responderEncuesta,
  getEncuestas,
  getEncuesta,
  getResumenEncuestas,
} from "../controllers/encuesta.controller.js";

const router = Router();

// ─── Rutas PÚBLICAS (sin token, el cliente accede desde su correo) ────────────
router.get("/responder/:token",  getEncuestaPublica);
router.post("/responder/:token", responderEncuesta);

// ─── Rutas PRIVADAS (requieren login) ────────────────────────────────────────
const rolesAdmin = ["developer", "gerencia", "oficina"];

router.get(
  "/resumen",
  verifyToken,
  checkRol(...rolesAdmin),
  getResumenEncuestas
);

router.get(
  "/",
  verifyToken,
  checkRol(...rolesAdmin),
  getEncuestas
);

router.get(
  "/:id",
  verifyToken,
  checkRol(...rolesAdmin),
  getEncuesta
);

router.post(
  "/enviar/:servicioId",
  verifyToken,
  checkRol(...rolesAdmin),
  enviarEncuesta
);

export default router;