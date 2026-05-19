import TipoServicio from "../models/TipoServicio.js";

export async function getTipos(req, res) {
  try {
    const tipos = await TipoServicio.find({ activo: true })
      .populate("refacciones.refaccion", "nombre numeroParte unidad")
      .sort({ nombre: 1 });
    res.json(tipos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createTipo(req, res) {
  try {
    const tipo = await TipoServicio.create(req.body);
    res.status(201).json(tipo);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateTipo(req, res) {
  try {
    const tipo = await TipoServicio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!tipo) return res.status(404).json({ message: "Tipo no encontrado" });
    res.json(tipo);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteTipo(req, res) {
  try {
    await TipoServicio.findByIdAndUpdate(req.params.id, { activo: false });
    res.json({ message: "Tipo eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}