import RefaccionUsada from "../models/RefaccionUsada.js";

export async function getRefaccionesUsadas(req, res) {
  try {
    const items = await RefaccionUsada.find()
      .populate("servicio", "folio problema")
      .populate("montacargas", "numeroEconomico marca")
      .populate("registradoPor", "nombre")
      .sort({ createdAt: -1 });
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createRefaccionUsada(req, res) {
  try {
    const body = { ...req.body };
    if (!body.servicio)    delete body.servicio;
    if (!body.montacargas) delete body.montacargas;
    body.registradoPor = req.userId;
    const item = await RefaccionUsada.create(body);
    const populated = await RefaccionUsada.findById(item._id)
      .populate("servicio", "folio problema")
      .populate("montacargas", "numeroEconomico marca")
      .populate("registradoPor", "nombre");
    res.status(201).json(populated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteRefaccionUsada(req, res) {
  try {
    await RefaccionUsada.findByIdAndDelete(req.params.id);
    res.json({ message: "Eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}