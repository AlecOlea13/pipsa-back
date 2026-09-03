import { Router } from "express";
import { getCxcs, createCxc, updateCxc, deleteCxc, cobrarCxc, cobrarPorRep, cobrarMultiple } from "../controllers/cxc.controller.js";
import { auth, requireRol } from "../middleware/auth.js";
import { cancelarCxc } from "../controllers/cxc.controller.js";

const router = Router();
const canAccess = requireRol("developer", "gerencia", "oficina");

router.get("/",                auth, canAccess, getCxcs);
router.post("/",               auth, canAccess, createCxc);
router.post("/cobrar-por-rep", auth, canAccess, cobrarPorRep);
router.post("/cobrar-multiple", auth, canAccess, cobrarMultiple);
router.put("/:id",             auth, canAccess, updateCxc);
router.delete("/:id",          auth, requireRol("developer", "gerencia", "oficina"), deleteCxc);
router.post("/:id/cobrar",     auth, canAccess, cobrarCxc);
router.post("/:id/cancelar", auth, cancelarCxc);

export default router;