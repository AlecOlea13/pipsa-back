import { Router } from "express";
import { getRefacciones, createRefaccion, updateRefaccion, deleteRefaccion, ajustarStock } from "../controllers/refaccion.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const rw       = requireRol("developer", "gerencia");
const rwAlmacen = requireRol("developer", "gerencia", "almacen", "supervisor_almacen");

router.get("/",           auth, getRefacciones);
router.post("/", auth, rwAlmacen, createRefaccion);
router.put("/:id",        auth, rwAlmacen, updateRefaccion);
router.delete("/:id",     auth, rw, deleteRefaccion);
router.post("/:id/stock", auth, rwAlmacen, ajustarStock);

export default router;