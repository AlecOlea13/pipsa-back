import { Router } from "express";
import { getRefacciones, createRefaccion, updateRefaccion, deleteRefaccion, ajustarStock } from "../controllers/refaccion.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const rw = requireRol("developer", "gerencia");

router.get("/",              auth, getRefacciones);
router.post("/",             auth, rw, createRefaccion);
router.put("/:id",           auth, rw, updateRefaccion);
router.delete("/:id",        auth, rw, deleteRefaccion);
router.post("/:id/stock",    auth, rw, ajustarStock);

export default router;