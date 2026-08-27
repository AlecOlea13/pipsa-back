// routes/reporteCliente.routes.js
import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import { getReportes, crearReporte, actualizarEstatus, getMontacargasCliente } from "../controllers/reporteCliente.controller.js";

const router = Router();

router.get("/mis-montacargas", auth, requireRol("cliente"), getMontacargasCliente);
router.get("/",    auth, requireRol("developer", "gerencia", "cliente"), getReportes);
router.post("/",   auth, requireRol("cliente"), crearReporte);
router.put("/:id", auth, requireRol("developer", "gerencia"), actualizarEstatus);

export default router;