import { Router } from "express";
import { getOrdenes, getOrden, surtirOrden } from "../controllers/ordenRefaccion.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();

router.get("/",              auth, getOrdenes);
router.get("/:id",           auth, getOrden);
router.post("/:id/surtir",   auth, requireRol("developer","gerencia","oficina","almacen"), surtirOrden);

export default router;