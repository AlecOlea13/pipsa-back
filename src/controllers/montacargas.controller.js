import Montacargas from "../models/Montacargas.js";

export async function getMontacargas(req, res) {
  try {
    const montas = await Montacargas.find()
      .populate("clienteActual", "nombre")
      .sort({ numeroEconomico: 1 });
    res.json(montas);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getMonta(req, res) {
  try {
    const monta = await Montacargas.findById(req.params.id).populate("clienteActual", "nombre");
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createMonta(req, res) {
  try {
    const monta = new Montacargas(req.body);
    await monta.save();
    res.status(201).json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateMonta(req, res) {
  try {
    const monta = await Montacargas.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteMonta(req, res) {
  try {
    await Montacargas.findByIdAndDelete(req.params.id);
    res.json({ message: "Montacargas eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function asignarCliente(req, res) {
  try {
    const { clienteId } = req.body;
    const monta = await Montacargas.findByIdAndUpdate(
      req.params.id,
      { clienteActual: clienteId, estatus: "rentado" },
      { new: true }
    ).populate("clienteActual", "nombre");
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function regresarMonta(req, res) {
  try {
    const { estatus } = req.body; // "disponible" o "taller"
    const monta = await Montacargas.findByIdAndUpdate(
      req.params.id,
      { clienteActual: null, estatus: estatus || "disponible" },
      { new: true }
    );
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}