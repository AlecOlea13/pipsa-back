import { Router } from "express";
import {
  getMontacargas, getMonta, createMonta, updateMonta, deleteMonta,
  asignarCliente, regresarMonta,
  marcarVendido, editarVenta, deshacerVenta, reporteVentas,
} from "../controllers/montacargas.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.get('/',                   auth, getMontacargas);
router.get('/reporte-ventas',     auth, reporteVentas);   // ⚠️ debe ir ANTES de '/:id' para no chocar con el param
router.get('/:id',                auth, getMonta);
router.post('/',                  auth, createMonta);
router.put('/:id',                auth, updateMonta);
router.delete('/:id',             auth, deleteMonta);
router.post('/:id/asignar',       auth, asignarCliente);
router.post('/:id/regresar',      auth, regresarMonta);
router.post('/:id/vender',        auth, marcarVendido);
router.put('/:id/editar-venta',   auth, editarVenta);
router.post('/:id/deshacer-venta',auth, deshacerVenta);

export default router;