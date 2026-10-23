import { Router } from "express";
import {
  getEquiposCliente, createEquipoCliente, updateEquipoCliente,
  deleteEquipoCliente, getServiciosPorEquipoCliente,
} from "../controllers/equipoCliente.controller.js";
import { auth, requireRol } from "../middleware/auth.js";

const router = Router();
// El técnico también puede dar de alta (levantamientos en campo)
const rw  = requireRol("developer", "gerencia", "oficina", "tecnico");
const adm = requireRol("developer", "gerencia", "oficina");

router.get("/",                    auth, getEquiposCliente);
router.get("/:id/servicios",       auth, getServiciosPorEquipoCliente);
router.post("/",                   auth, rw,  createEquipoCliente);
router.put("/:id",                 auth, rw,  updateEquipoCliente);
router.delete("/:id",              auth, adm, deleteEquipoCliente);

export default router;