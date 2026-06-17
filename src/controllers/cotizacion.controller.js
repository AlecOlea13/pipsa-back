import Cotizacion from "../models/Cotizacion.js";

export async function getCotizaciones(req, res) {
  try {
    const cotizaciones = await Cotizacion.find()
      .populate("cliente", "nombre direccion telefono contacto")
      .populate("montacargas", "numeroEconomico marca modelo capacidad tipo serie alturaColapsada alturaLevante horquillas desplazadorLateral tipoLlantas voltaje tipoBateria incluyeCargador equipoSeguridad")
      .populate("asesor", "nombre puesto telefono email")
      .populate("comentarios.autor", "nombre rol")
      .sort({ createdAt: -1 });
    res.json(cotizaciones);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getCotizacion(req, res) {
  try {
    const cotizacion = await Cotizacion.findById(req.params.id)
      .populate("cliente")
      .populate("montacargas")
      .populate("asesor", "nombre puesto telefono email")
      .populate("comentarios.autor", "nombre rol");
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json(cotizacion);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createCotizacion(req, res) {
  try {
    const body = { ...req.body };
    if (!body.montacargas) delete body.montacargas;
    if (!body.asesor)      delete body.asesor;

    // Cliente ocasional vs. cliente de catálogo — mutuamente excluyentes
    if (body.clienteOcasional?.nombre) {
      body.cliente = null;
    } else {
      delete body.clienteOcasional;
      if (!body.cliente) delete body.cliente;
    }

    if (!body.folio) {
      const anio = new Date().getFullYear();
      const ultima = await Cotizacion.findOne(
        { folio: { $regex: `^COT-${anio}-` } },
        { folio: 1 },
        { sort: { createdAt: -1 } }
      );
      let siguiente = 1;
      if (ultima?.folio) {
        const partes = ultima.folio.split("-");
        const num    = parseInt(partes[partes.length - 1]);
        if (!isNaN(num)) siguiente = num + 1;
      }
      body.folio = `COT-${anio}-${String(siguiente).padStart(3, "0")}`;
    }

    const cotizacion = new Cotizacion(body);
    await cotizacion.save();
    res.status(201).json(cotizacion);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Folio duplicado, intenta de nuevo" });
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateCotizacion(req, res) {
  try {
    const body = { ...req.body };
    if (!body.montacargas) delete body.montacargas;
    if (!body.asesor)      delete body.asesor;

    if (body.clienteOcasional?.nombre) {
      body.cliente = null;
    } else if (body.clienteOcasional !== undefined) {
      body.clienteOcasional = null;
    }

    const cotizacion = await Cotizacion.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: false }
    ).populate("cliente", "nombre direccion telefono contacto")
     .populate("montacargas", "numeroEconomico marca modelo capacidad tipo serie alturaColapsada alturaLevante horquillas desplazadorLateral tipoLlantas voltaje tipoBateria incluyeCargador equipoSeguridad")
     .populate("asesor", "nombre puesto telefono email")
     .populate("comentarios.autor", "nombre rol");
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json(cotizacion);
  } catch (e) {
    console.error("Error updateCotizacion:", e.message);
    res.status(500).json({ message: e.message });
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

export async function agregarComentario(req, res) {
  try {
    const { texto } = req.body;
    if (!texto?.trim()) return res.status(400).json({ message: "El comentario no puede estar vacío" });
    const cotizacion = await Cotizacion.findByIdAndUpdate(
      req.params.id,
      { $push: { comentarios: { texto: texto.trim(), autor: req.userId, fecha: new Date() } } },
      { new: true }
    ).populate("comentarios.autor", "nombre rol");
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json(cotizacion.comentarios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function eliminarComentario(req, res) {
  try {
    const cotizacion = await Cotizacion.findByIdAndUpdate(
      req.params.id,
      { $pull: { comentarios: { _id: req.params.comentarioId } } },
      { new: true }
    );
    if (!cotizacion) return res.status(404).json({ message: "Cotización no encontrada" });
    res.json({ message: "Comentario eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}