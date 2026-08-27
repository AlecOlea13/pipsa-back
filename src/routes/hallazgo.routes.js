// routes/hallazgo.routes.js
import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import { getHallazgos, subirDocumento, eliminarDocumento } from "../controllers/hallazgo.controller.js";

const router = Router();

// Visible para developer, gerencia y cliente (Dicka puede ver la auditoría)
const puedeVer    = ["developer", "gerencia", "cliente"];
const puedeEditar = ["developer", "gerencia"];

router.get("/",                        auth, requireRol(...puedeVer),    getHallazgos);
router.post("/:id/documentos",         auth, requireRol(...puedeEditar), subirDocumento);
router.delete("/:id/documentos/:docId",auth, requireRol(...puedeEditar), eliminarDocumento);

export default router;