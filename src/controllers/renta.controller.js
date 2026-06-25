import Renta from "../models/Renta.js";
import Montacargas from "../models/Montacargas.js";

export async function getRentas(req, res) {
  try {
    const rentas = await Renta.find()
      .populate("cliente", "nombre")
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("asesor", "nombre")
      .sort({ createdAt: -1 });
    res.json(rentas);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getRenta(req, res) {
  try {
    const renta = await Renta.findById(req.params.id)
      .populate("cliente", "nombre")
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("asesor", "nombre");
    if (!renta) return res.status(404).json({ message: "Renta no encontrada" });
    res.json(renta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createRenta(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor) delete body.asesor;
    const renta = new Renta(body);
    await renta.save();
    await Montacargas.findByIdAndUpdate(req.body.montacargas, {
      clienteActual: req.body.cliente,
      estatus: "rentado",
    });
    res.status(201).json(renta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateRenta(req, res) {
  try {
    const renta = await Renta.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!renta) return res.status(404).json({ message: "Renta no encontrada" });
    res.json(renta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cerrarRenta(req, res) {
  try {
    const { estatusMonta } = req.body;
    const renta = await Renta.findByIdAndUpdate(
      req.params.id,
      { estatus: "terminada", fechaFin: new Date() },
      { new: true }
    );
    if (!renta) return res.status(404).json({ message: "Renta no encontrada" });
    await Montacargas.findByIdAndUpdate(renta.montacargas, {
      clienteActual: null,
      estatus: estatusMonta || "disponible",
    });
    res.json(renta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function renovarRenta(req, res) {
  try {
    const { fechaFinNueva, precioMensualNuevo, notas } = req.body;
    if (!fechaFinNueva || !precioMensualNuevo) {
      return res.status(400).json({ message: "Fecha de fin y precio son requeridos" });
    }

    const renta = await Renta.findById(req.params.id);
    if (!renta) return res.status(404).json({ message: "Renta no encontrada" });
    if (renta.estatus === "terminada") {
      return res.status(400).json({ message: "No se puede renovar una renta terminada" });
    }

    const renovacion = {
      fechaFinAnterior:      renta.fechaFin ?? null,
      precioMensualAnterior: renta.precioMensual,
      fechaFinNueva:         new Date(fechaFinNueva),
      precioMensualNuevo:    Number(precioMensualNuevo),
      fechaRenovacion:       new Date(),
      notas:                 notas ?? "",
    };

    renta.renovaciones.push(renovacion);
    renta.fechaFin      = renovacion.fechaFinNueva;
    renta.precioMensual = renovacion.precioMensualNuevo;
    renta.estatus        = "activa"; // por si estaba marcada como vencida
    await renta.save();

    await renta.populate([
      { path: "cliente", select: "nombre" },
      { path: "montacargas", select: "numeroEconomico marca modelo" },
      { path: "asesor", select: "nombre" },
    ]);

    res.json(renta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}