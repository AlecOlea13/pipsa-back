import Refaccion from "../models/Refaccion.js";

export async function getRefacciones(req, res) {
  try {
    const refacciones = await Refaccion.find({ activo: true }).sort({ nombre: 1 });
    res.json(refacciones);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createRefaccion(req, res) {
  try {
    const ref = await Refaccion.create(req.body);
    res.status(201).json(ref);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateRefaccion(req, res) {
  try {
    const ref = await Refaccion.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!ref) return res.status(404).json({ message: "Refacción no encontrada" });
    res.json(ref);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteRefaccion(req, res) {
  try {
    await Refaccion.findByIdAndUpdate(req.params.id, { activo: false });
    res.json({ message: "Refacción eliminada" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function ajustarStock(req, res) {
  try {
    const { cantidad, tipo } = req.body; // tipo: "entrada" | "salida"
    const ref = await Refaccion.findById(req.params.id);
    if (!ref) return res.status(404).json({ message: "Refacción no encontrada" });
    ref.stock = tipo === "entrada" ? ref.stock + cantidad : ref.stock - cantidad;
    if (ref.stock < 0) ref.stock = 0;
    await ref.save();
    res.json(ref);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}