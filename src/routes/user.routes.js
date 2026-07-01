import { Router } from "express";
import { getUsers, createUser, updateUser, deleteUser } from "../controllers/user.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();

router.get("/",        auth, requireRol("developer", "gerencia", "oficina"), getUsers);
router.post("/",       auth, requireRol("developer"), createUser);
router.put("/:id",     auth, requireRol("developer"), updateUser);
router.delete("/:id",  auth, requireRol("developer"), deleteUser);

export default router;