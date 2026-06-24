import { Router } from "express";
import { getPortales, createPortal, updatePortal, deletePortal } from "../controllers/portal.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
const canAccess = requireRol("developer", "gerencia", "oficina");

router.get("/",       auth, canAccess, getPortales);
router.post("/",      auth, canAccess, createPortal);
router.put("/:id",    auth, canAccess, updatePortal);
router.delete("/:id", auth, canAccess, deletePortal);

export default router;