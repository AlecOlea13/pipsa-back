import Gasto from "../models/Gasto.js";

export async function getGastos(req, res) {
  try {
    const gastos = await Gasto.find().sort({ fechaEmision: -1 });
    res.json(gastos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createGasto(req, res) {
  try {
    const gasto = new Gasto(req.body);
    await gasto.save();
    res.status(201).json(gasto);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Este XML ya fue registrado (UUID duplicado)" });
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateGasto(req, res) {
  try {
    const gasto = await Gasto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });
    res.json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteGasto(req, res) {
  try {
    await Gasto.findByIdAndDelete(req.params.id);
    res.json({ message: "Gasto eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}