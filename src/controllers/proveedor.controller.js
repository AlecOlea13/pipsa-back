import Proveedor from "../models/Proveedor.js";

export const getProveedores = async (req, res) => {
  try {
    const proveedores = await Proveedor.find().sort({ nombre: 1 });
    res.json(proveedores);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

export const createProveedor = async (req, res) => {
  try {
    const p = await Proveedor.create(req.body);
    res.status(201).json(p);
  } catch (e) { res.status(400).json({ message: e.message }); }
};

export const updateProveedor = async (req, res) => {
  try {
    const p = await Proveedor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) return res.status(404).json({ message: "No encontrado" });
    res.json(p);
  } catch (e) { res.status(400).json({ message: e.message }); }
};

export const deleteProveedor = async (req, res) => {
  try {
    await Proveedor.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
};