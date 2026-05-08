import { Router } from "express";
import { getCotizaciones, getCotizacion, createCotizacion, updateCotizacion, deleteCotizacion } from "../controllers/cotizacion.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',           auth, getCotizaciones);
router.get('/:id',        auth, getCotizacion);
router.post('/',          auth, createCotizacion);
router.put('/:id',        auth, updateCotizacion);
router.delete('/:id',     auth, deleteCotizacion);

export default router;