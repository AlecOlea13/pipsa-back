import { Router } from "express";
import { getRentas, getRenta, createRenta, updateRenta, cerrarRenta, renovarRenta, buscarRentasPorRfc } from "../controllers/renta.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get("/",                  auth, getRentas);
router.get("/:id",               auth, getRenta);
router.post("/",                 auth, createRenta);
router.post("/buscar-por-rfc",   auth, buscarRentasPorRfc);
router.put("/:id",               auth, updateRenta);
router.post("/:id/cerrar",       auth, cerrarRenta);
router.post("/:id/renovar",      auth, renovarRenta);

export default router;