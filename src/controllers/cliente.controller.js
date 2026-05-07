import Cliente from "../models/Cliente.js";

export async function getClientes(req, res) {
  try {
    const clientes = await Cliente.find().sort({ createdAt: -1 });
    res.json(clientes);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getCliente(req, res) {
  try {
    const cliente = await Cliente.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: "Cliente no encontrado" });
    res.json(cliente);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createCliente(req, res) {
  try {
    const cliente = new Cliente(req.body);
    await cliente.save();
    res.status(201).json(cliente);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateCliente(req, res) {
  try {
    const cliente = await Cliente.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cliente) return res.status(404).json({ message: "Cliente no encontrado" });
    res.json(cliente);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteCliente(req, res) {
  try {
    await Cliente.findByIdAndDelete(req.params.id);
    res.json({ message: "Cliente eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}