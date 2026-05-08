import Factura from "../models/Factura.js";

export async function getFacturas(req, res) {
  try {
    const facturas = await Factura.find()
      .populate("cliente", "nombre")
      .populate("renta")
      .sort({ fechaVencimiento: 1 });
    res.json(facturas);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getFactura(req, res) {
  try {
    const factura = await Factura.findById(req.params.id)
      .populate("cliente", "nombre")
      .populate("renta");
    if (!factura) return res.status(404).json({ message: "Factura no encontrada" });
    res.json(factura);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createFactura(req, res) {
  try {
    const factura = new Factura(req.body);
    await factura.save();
    res.status(201).json(factura);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateFactura(req, res) {
  try {
    const factura = await Factura.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!factura) return res.status(404).json({ message: "Factura no encontrada" });
    res.json(factura);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function marcarPagada(req, res) {
  try {
    const factura = await Factura.findByIdAndUpdate(
      req.params.id,
      { pagado: true, diasVencidos: 0 },
      { new: true }
    );
    if (!factura) return res.status(404).json({ message: "Factura no encontrada" });
    res.json(factura);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}