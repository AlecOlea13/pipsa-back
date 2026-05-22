import { Router } from "express";
import {
  getCotizaciones, getCotizacion, createCotizacion,
  updateCotizacion, deleteCotizacion,
  agregarComentario, eliminarComentario,
} from "../controllers/cotizacion.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();

const canComment = requireRol("developer", "gerencia", "oficina");

router.get("/",                                    auth, getCotizaciones);
router.get("/:id",                                 auth, getCotizacion);
router.post("/",                                   auth, requireRol("developer","gerencia","oficina"), createCotizacion);
router.put("/:id",                                 auth, requireRol("developer","gerencia","oficina"), updateCotizacion);
router.delete("/:id",                              auth, requireRol("developer","gerencia"), deleteCotizacion);
router.post("/:id/comentarios",                    auth, canComment, agregarComentario);
router.delete("/:id/comentarios/:comentarioId",    auth, canComment, eliminarComentario);

export default router;