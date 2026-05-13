import { Router } from "express";
import { getAsesores, getAsesor, createAsesor, updateAsesor, deleteAsesor } from "../controllers/asesor.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',       auth, getAsesores);
router.get('/:id',    auth, getAsesor);
router.post('/',      auth, createAsesor);
router.put('/:id',    auth, updateAsesor);
router.delete('/:id', auth, deleteAsesor);

export default router;