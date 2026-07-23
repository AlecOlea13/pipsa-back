import Asesor from "../models/Asesor.js";

export async function getAsesores(req, res) {
  try {
    const asesores = await Asesor.find({ activo: true })
      .populate("usuario", "nombre username rol")
      .sort({ nombre: 1 });
    res.json(asesores);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getAsesor(req, res) {
  try {
    const asesor = await Asesor.findById(req.params.id)
      .populate("usuario", "nombre username rol");
    if (!asesor) return res.status(404).json({ message: "Asesor no encontrado" });
    res.json(asesor);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createAsesor(req, res) {
  try {
    const asesor = new Asesor(req.body);
    await asesor.save();
    await asesor.populate("usuario", "nombre username rol");
    res.status(201).json(asesor);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateAsesor(req, res) {
  try {
    const asesor = await Asesor.findByIdAndUpdate(
      req.params.id, req.body, { new: true }
    ).populate("usuario", "nombre username rol");
    if (!asesor) return res.status(404).json({ message: "Asesor no encontrado" });
    res.json(asesor);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteAsesor(req, res) {
  try {
    await Asesor.findByIdAndUpdate(req.params.id, { activo: false });
    res.json({ message: "Asesor desactivado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}