import Portal from "../models/Portal.js";

export async function getPortales(req, res) {
  try {
    const portales = await Portal.find().sort({ nombre: 1 });
    res.json(portales);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createPortal(req, res) {
  try {
    const portal = new Portal(req.body);
    await portal.save();
    res.status(201).json(portal);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updatePortal(req, res) {
  try {
    const portal = await Portal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!portal) return res.status(404).json({ message: "Portal no encontrado" });
    res.json(portal);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deletePortal(req, res) {
  try {
    await Portal.findByIdAndDelete(req.params.id);
    res.json({ message: "Portal eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}