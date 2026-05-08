import Servicio from "../models/Servicio.js";
import Montacargas from "../models/montacargas.js";

export async function getServicios(req, res) {
  try {
    const servicios = await Servicio.find()
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("cliente", "nombre")
      .sort({ createdAt: -1 });
    res.json(servicios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id)
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("cliente", "nombre");
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createServicio(req, res) {
  try {
    const servicio = new Servicio(req.body);
    await servicio.save();
    await Montacargas.findByIdAndUpdate(req.body.montacargas, { estatus: "mantenimiento" });
    res.status(201).json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateServicio(req, res) {
  try {
    const servicio = await Servicio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cerrarServicio(req, res) {
  try {
    const { horometro, proximoServicio, estatusMonta } = req.body;
    const servicio = await Servicio.findByIdAndUpdate(
      req.params.id,
      { estatus: "cerrado" },
      { new: true }
    );
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    await Montacargas.findByIdAndUpdate(servicio.montacargas, {
      horometroActual: horometro,
      fechaUltimoServicio: new Date(),
      proximoServicio,
      estatus: estatusMonta || "disponible",
    });
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}