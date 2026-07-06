import { Router } from "express";
import { auth } from "../middleware/auth.js";
import Vehiculo from "../models/Vehiculo.js";

const router = Router();

// ── CRUD vehículos ──
router.get("/", auth, async (req, res) => {
  try {
    const vehiculos = await Vehiculo.find({ activo: true }).sort({ numero: 1 });
    res.json(vehiculos);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", auth, async (req, res) => {
  try {
    const vehiculo = new Vehiculo(req.body);
    await vehiculo.save();
    res.status(201).json(vehiculo);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.put("/:id", auth, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(vehiculo);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete("/:id", auth, async (req, res) => {
  try {
    await Vehiculo.findByIdAndUpdate(req.params.id, { activo: false });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Historial de servicios ──
router.post("/:id/servicios", auth, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id);
    vehiculo.historial.unshift(req.body);
    if (req.body.km) vehiculo.kmActual = req.body.km;
    await vehiculo.save();
    res.json(vehiculo);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete("/:id/servicios/:servicioId", auth, async (req, res) => {
  try {
    const vehiculo = await Vehiculo.findById(req.params.id);
    vehiculo.historial = vehiculo.historial.filter(s => s._id.toString() !== req.params.servicioId);
    await vehiculo.save();
    res.json(vehiculo);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

// ── Alertas ──
router.get("/alertas", auth, async (req, res) => {
  try {
    const vehiculos = await Vehiculo.find({ activo: true });
    const hoy       = new Date();
    const en30      = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const en7       = new Date(Date.now() +  7 * 24 * 60 * 60 * 1000);
    const alertas   = [];

    for (const v of vehiculos) {
      const nombre = `${v.marca} ${v.modelo} — ${v.placa}`;

      if (v.vencimientoSeguro) {
        const fecha = new Date(v.vencimientoSeguro);
        if (fecha < hoy)
          alertas.push({ tipo: "critico", icon: "🛡️", mensaje: `Seguro VENCIDO: ${nombre}`, ruta: "/dashboard/flota" });
        else if (fecha <= en7)
          alertas.push({ tipo: "critico", icon: "🛡️", mensaje: `Seguro vence en menos de 7 días: ${nombre}`, ruta: "/dashboard/flota" });
        else if (fecha <= en30)
          alertas.push({ tipo: "advertencia", icon: "🛡️", mensaje: `Seguro vence pronto: ${nombre}`, ruta: "/dashboard/flota" });
      }

      if (v.vencimientoTC) {
        const fecha = new Date(v.vencimientoTC);
        if (fecha < hoy)
          alertas.push({ tipo: "critico", icon: "📋", mensaje: `Tarjeta de circulación VENCIDA: ${nombre}`, ruta: "/dashboard/flota" });
        else if (fecha <= en30)
          alertas.push({ tipo: "advertencia", icon: "📋", mensaje: `Tarjeta de circulación vence pronto: ${nombre}`, ruta: "/dashboard/flota" });
      }

      if (v.proximoServicioFecha) {
        const fecha = new Date(v.proximoServicioFecha);
        if (fecha < hoy)
          alertas.push({ tipo: "critico", icon: "🔧", mensaje: `Servicio VENCIDO: ${nombre}`, ruta: "/dashboard/flota" });
        else if (fecha <= en30)
          alertas.push({ tipo: "advertencia", icon: "🔧", mensaje: `Servicio próximo: ${nombre}`, ruta: "/dashboard/flota" });
      }

      if (v.proximoServicioKm && v.kmActual) {
        const diferencia = v.proximoServicioKm - v.kmActual;
        if (diferencia <= 0)
          alertas.push({ tipo: "critico", icon: "🔧", mensaje: `Servicio por km VENCIDO: ${nombre} (${v.kmActual} km)`, ruta: "/dashboard/flota" });
        else if (diferencia <= 1000)
          alertas.push({ tipo: "advertencia", icon: "🔧", mensaje: `Servicio por km próximo: ${nombre} (faltan ${diferencia} km)`, ruta: "/dashboard/flota" });
      }
    }

    res.json(alertas);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;