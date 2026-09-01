import Pendiente from "../models/Pendiente.js";

export async function getPendientes(req, res) {
  try {
    const filtro = {};
    if (req.userRol === "tecnico") filtro.tecnico = req.userId;

    const { resuelto } = req.query;
    if (resuelto === "true") filtro.resuelto = true;
    if (resuelto === "false") filtro.resuelto = false;

    const pendientes = await Pendiente.find(filtro)
      .populate("servicio", "folio")
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("cliente", "nombre")
      .populate("tecnico", "nombre")
      .populate("resueltoPor", "nombre")
      .sort({ resuelto: 1, createdAt: -1 });

    res.json(pendientes);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function crearPendientes(req, res) {
  try {
    const { servicioId, montacargasId, clienteId, tecnicoId, descripciones } = req.body;
    if (!servicioId || !tecnicoId || !Array.isArray(descripciones) || descripciones.length === 0) {
      return res.status(400).json({ message: "Datos incompletos" });
    }

    const docs = descripciones
      .filter(d => d?.trim())
      .map(d => ({
        servicio: servicioId,
        montacargas: montacargasId || undefined,
        cliente: clienteId || undefined,
        tecnico: tecnicoId,
        descripcion: d.trim(),
      }));

    if (docs.length === 0) return res.status(400).json({ message: "Sin descripciones válidas" });

    const creados = await Pendiente.insertMany(docs);
    res.status(201).json(creados);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function marcarResuelto(req, res) {
  try {
    const pendiente = await Pendiente.findById(req.params.id);
    if (!pendiente) return res.status(404).json({ message: "Pendiente no encontrado" });

    const puedeMarcar =
      ["developer", "gerencia", "supervisor_almacen"].includes(req.userRol) ||
      String(pendiente.tecnico) === String(req.userId);
    if (!puedeMarcar) return res.status(403).json({ message: "No tienes permiso" });

    pendiente.resuelto = true;
    pendiente.fechaResuelto = new Date();
    pendiente.resueltoPor = req.userId;
    await pendiente.save();

    await pendiente.populate([
      { path: "servicio", select: "folio" },
      { path: "montacargas", select: "numeroEconomico marca modelo" },
      { path: "cliente", select: "nombre" },
      { path: "tecnico", select: "nombre" },
      { path: "resueltoPor", select: "nombre" },
    ]);

    res.json(pendiente);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function reabrirPendiente(req, res) {
  try {
    const pendiente = await Pendiente.findByIdAndUpdate(
      req.params.id,
      { resuelto: false, fechaResuelto: null, resueltoPor: null },
      { new: true }
    ).populate([
      { path: "servicio", select: "folio" },
      { path: "montacargas", select: "numeroEconomico marca modelo" },
      { path: "cliente", select: "nombre" },
      { path: "tecnico", select: "nombre" },
    ]);
    if (!pendiente) return res.status(404).json({ message: "Pendiente no encontrado" });
    res.json(pendiente);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function eliminarPendiente(req, res) {
  try {
    await Pendiente.findByIdAndDelete(req.params.id);
    res.json({ message: "Eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}
