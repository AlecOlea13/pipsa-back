import { Router } from "express";
import { getCxcs, createCxc, updateCxc, deleteCxc, cobrarCxc } from "../controllers/cxc.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const canAccess = requireRol("developer", "gerencia", "oficina");

router.get("/",          auth, canAccess, getCxcs);
router.post("/",         auth, canAccess, createCxc);
router.put("/:id",       auth, canAccess, updateCxc);
router.delete("/:id",    auth, requireRol("developer", "gerencia"), deleteCxc);
router.post("/:id/cobrar", auth, canAccess, cobrarCxc);

export default router;