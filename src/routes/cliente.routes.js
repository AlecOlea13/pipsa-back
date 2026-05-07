import { Router } from "express";
import { getClientes, getCliente, createCliente, updateCliente, deleteCliente } from "../controllers/cliente.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',         auth, getClientes);
router.get('/:id',      auth, getCliente);
router.post('/',        auth, createCliente);
router.put('/:id',      auth, updateCliente);
router.delete('/:id',   auth, deleteCliente);

export default router;