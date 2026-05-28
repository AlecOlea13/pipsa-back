import GastoNoFiscal from "../models/GastoNoFiscal.js";

export async function getGastosNoFiscales(req, res) {
  try {
    const gastos = await GastoNoFiscal.find()
      .populate("asesor", "nombre")
      .sort({ fecha: -1 });
    res.json(gastos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createGastoNoFiscal(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor) delete body.asesor;
    const gasto = new GastoNoFiscal(body);
    await gasto.save();
    await gasto.populate("asesor", "nombre");
    res.status(201).json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateGastoNoFiscal(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor) delete body.asesor;
    const gasto = await GastoNoFiscal.findByIdAndUpdate(req.params.id, body, { new: true })
      .populate("asesor", "nombre");
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });
    res.json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteGastoNoFiscal(req, res) {
  try {
    await GastoNoFiscal.findByIdAndDelete(req.params.id);
    res.json({ message: "Gasto eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}