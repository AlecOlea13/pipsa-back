import Cotizacion from "../models/Cotizacion.js";

// export async function getCotizaciones(req, res) {
//   try {
//     const cotizaciones = await Cotizacion.find()
//       .populate("cliente", "nombre")
//       .populate("montacargas", "numeroEconomico marca modelo")
//       .sort({ createdAt: -1 });
//     res.json(cotizaciones);
//   } catch (e) {
//     res.status(500).json({ message: "Error en el servidor" });
//   }
// }

// export async function getCotizaciones(req, res) {
//   try {
//     const cotizaciones = await Cotizacion.find()
//       .populate("cliente", "nombre")
//       .populate("montacargas", "numeroEconomico marca modelo")
//       .populate("asesor", "nombre puesto telefono email")
//       .sort({ createdAt: -1 });
//     res.json(cotizaciones);
//   } catch (e) {
//     res.status(500).json({ message: "Error en el servidor" });
//   }
// }

export async function getCotizacion(req, res) {
  try {
    const cotizacion = await Cotizacion.findById(req.params.id)
      .populate("cliente")
      .populate("montacargas")
      .populate("asesor", "nombre puesto telefono email");
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json(cotizacion);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateCotizacion(req, res) {
  try {
    const cotizacion = await Cotizacion.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json(cotizacion);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteCotizacion(req, res) {
  try {
    await Cotizacion.findByIdAndDelete(req.params.id);
    res.json({ message: "Cotización eliminada" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}