import mongoose from "mongoose";
import Cotizacion from "../models/Cotizacion.js";
import { obtenerReportePorAsesor, validarFiltrosReporte } from "../services/reporteCotizaciones.service.js";

const PREFIJO_POR_TIPO = {
  servicio:    "SRV",
  renta:       "REN",
  venta:       "VTA",
  refacciones: "REF",
};

// ── Visibilidad: developer/gerencia ven todas; los demás (oficina/vendedores) solo las suyas ──
const esAdmin = (req) => ["developer", "gerencia"].includes(req.userRol);
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

/** Asesor ligado al usuario en sesión: campo asesor/asesorId del usuario o, si no, mismo nombre. */
async function miAsesor(req) {
  try {
    const User = mongoose.models.User ?? mongoose.models.Usuario;
    const Asesor = mongoose.models.Asesor;
    if (!User || !Asesor) return null;
    const u = await User.findById(req.userId).lean();
    if (!u) return null;
    const directo = u.asesor ?? u.asesorId;
    if (directo && mongoose.isValidObjectId(directo)) {
      const a = await Asesor.findById(directo).select("nombre").lean();
      if (a) return a;
    }
    const nombre = norm(u.nombre ?? u.name);
    if (!nombre) return null;
    const todos = await Asesor.find().select("nombre").lean();
    return todos.find((a) => norm(a.nombre) === nombre) ?? null;
  } catch (e) {
    console.error("[cotizaciones/miAsesor]", e);
    return null;
  }
}

/** ¿Puede este usuario ver/modificar esta cotización? (admin siempre; los demás solo si es suya) */
async function puedeAccederCotizacion(req, cotizacionId) {
  if (esAdmin(req)) return true;
  const mia = await miAsesor(req);
  if (!mia) return false;
  const c = await Cotizacion.findById(cotizacionId).select("asesor").lean();
  return !!c?.asesor && String(c.asesor._id ?? c.asesor) === String(mia._id);
}

const SIN_PERMISO = { message: "No tienes permiso para ver esta cotización" };

export async function getCotizaciones(req, res) {
  try {
    const filtro = {};
    if (!esAdmin(req)) {
      const mia = await miAsesor(req);
      if (!mia) return res.json([]); // sin asesor ligado al usuario: no ve ninguna
      filtro.asesor = mia._id;
    }
    const cotizaciones = await Cotizacion.find(filtro)
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
    if (!esAdmin(req)) {
      const mia = await miAsesor(req);
      if (!mia || String(cotizacion.asesor?._id ?? "") !== String(mia._id))
        return res.status(403).json(SIN_PERMISO);
    }
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

    // Un vendedor solo crea cotizaciones a su nombre
    if (!esAdmin(req)) {
      const mia = await miAsesor(req);
      if (!mia) return res.status(403).json({ message: "Tu usuario no está ligado a un asesor; pide a gerencia que lo vincule" });
      body.asesor = mia._id;
    }

    if (body.clienteOcasional?.nombre) {
      body.cliente = null;
    } else {
      delete body.clienteOcasional;
      if (!body.cliente) delete body.cliente;
    }

    if (!body.folio) {
      const anio    = new Date().getFullYear();
      const prefijo = PREFIJO_POR_TIPO[body.tipo] ?? "COT";
      const ultima  = await Cotizacion.findOne(
        { folio: { $regex: `^${prefijo}-${anio}-` } },
        { folio: 1 },
        { sort: { createdAt: -1 } }
      );
      let siguiente = 1;
      if (ultima?.folio) {
        const partes = ultima.folio.split("-");
        const num    = parseInt(partes[partes.length - 1]);
        if (!isNaN(num)) siguiente = num + 1;
      }
      body.folio = `${prefijo}-${anio}-${String(siguiente).padStart(3, "0")}`;
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

    // Un vendedor solo edita las suyas y no puede reasignarlas a otro asesor
    if (!esAdmin(req)) {
      const mia = await miAsesor(req);
      if (!mia || !(await puedeAccederCotizacion(req, req.params.id)))
        return res.status(403).json({ message: "No tienes permiso para modificar esta cotización" });
      body.asesor = mia._id;
    }

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
    if (!(await puedeAccederCotizacion(req, req.params.id))) return res.status(403).json(SIN_PERMISO);
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
    if (!(await puedeAccederCotizacion(req, req.params.id))) return res.status(403).json(SIN_PERMISO);
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

// ── Reporte general por asesor (activa / facturada / cancelada, todos los tipos) ──
export async function getReportePorAsesor(req, res) {
  try {
    const { desde, hasta, asesorId, tipo } = req.query;
    const validacion = validarFiltrosReporte({ desde, hasta });
    if (!validacion.ok) return res.status(400).json({ message: validacion.mensaje });

    const resultado = await obtenerReportePorAsesor({ desde, hasta, asesorId, tipo });
    res.json(resultado);
  } catch (e) {
    console.error("Error getReportePorAsesor:", e);
    res.status(500).json({ message: "Error al generar el reporte" });
  }
}