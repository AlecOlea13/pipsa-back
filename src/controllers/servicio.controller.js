import Servicio from "../models/Servicio.js";
import Montacargas from "../models/Montacargas.js";
import OrdenRefaccion from "../models/OrdenRefaccion.js";
import TipoServicio from "../models/TipoServicio.js";
import CatalogoEquipo from "../models/CatalogoEquipo.js";
import User from "../models/User.js";
import { enviarEmailCierreServicio } from "../utils/mailer.js";

async function generarFolioServicio() {
  const ultimo = await Servicio.findOne().sort({ createdAt: -1 }).select("folio");
  if (!ultimo?.folio) return "SRV-001";
  const num = parseInt(ultimo.folio.split("-")[1] ?? "0") + 1;
  return `SRV-${String(num).padStart(3, "0")}`;
}

async function generarFolioOrden() {
  const ultima = await OrdenRefaccion.findOne().sort({ createdAt: -1 }).select("folio");
  if (!ultima?.folio) return "ORD-001";
  const num = parseInt(ultima.folio.split("-")[1] ?? "0") + 1;
  return `ORD-${String(num).padStart(3, "0")}`;
}

export async function getServicios(req, res) {
  try {
    const servicios = await Servicio.find()
      .populate("montacargas", "numeroEconomico marca modelo serie")
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({
        path: "ordenRefaccion",
        populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" },
      })
      .sort({ createdAt: -1 });
    res.json(servicios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id)
      .populate("montacargas", "numeroEconomico marca modelo serie")
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({
        path: "ordenRefaccion",
        populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" },
      });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createServicio(req, res) {
  try {
    const body = { ...req.body };
    if (!body.tipoServicio)    delete body.tipoServicio;
    if (!body.tecnicoAsignado) delete body.tecnicoAsignado;
    if (!body.cliente)         delete body.cliente;

    const folio = await generarFolioServicio();
    const servicio = new Servicio({ ...body, folio });
    await servicio.save();

    await Montacargas.findByIdAndUpdate(body.montacargas, { estatus: "mantenimiento" });

    let ordenId = null;
    if (body.tipoServicio) {
      const catalogo = await CatalogoEquipo.findOne({ montacargas: body.montacargas })
        .populate("refacciones.refaccion");

      let refacciones = [];
      if (catalogo && catalogo.refacciones.length > 0) {
        refacciones = catalogo.refacciones;
      } else {
        const tipo = await TipoServicio.findById(body.tipoServicio);
        refacciones = tipo?.refacciones ?? [];
      }

      if (refacciones.length > 0) {
        const folioOrden = await generarFolioOrden();
        const orden = await OrdenRefaccion.create({
          folio: folioOrden,
          servicio: servicio._id,
          montacargas: body.montacargas,
          items: refacciones.map(r => ({
            refaccion: r.refaccion._id ?? r.refaccion,
            cantidadSolicitada: r.cantidad,
            cantidadSurtida: 0,
            confirmado: false,
          })),
          estatus: "pendiente",
        });
        ordenId = orden._id;
        await servicio.updateOne({ ordenRefaccion: ordenId });
      }
    }

    res.status(201).json({ ...servicio.toObject(), folio, ordenRefaccion: ordenId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateServicio(req, res) {
  try {
    const servicio = await Servicio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cerrarServicio(req, res) {
  try {
    const {
      horometro, proximoServicio, estatusMonta,
      notasCierre, fotoHojaFirmada, fotoEquipoFinal,
    } = req.body;

    const servicio = await Servicio.findByIdAndUpdate(
      req.params.id,
      {
        estatus: "cerrado",
        horometroCierre: horometro,
        proximoServicio,
        notasCierre,
        fotoHojaFirmada: fotoHojaFirmada ?? null,
        fotoEquipoFinal: fotoEquipoFinal ?? null,
      },
      { new: true }
    )
      .populate("montacargas", "numeroEconomico marca modelo serie")
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({
        path: "ordenRefaccion",
        populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" },
      });

    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });

    await Montacargas.findByIdAndUpdate(servicio.montacargas, {
      horometroActual: horometro,
      fechaUltimoServicio: new Date(),
      proximoServicio,
      estatus: estatusMonta || "disponible",
    });

    // ── Enviar email a developer y gerencia ──
    try {
      const destinatarios = await User.find({
        rol: { $in: ["developer", "gerencia"] },
        activo: true,
      }).select("nombre username");

      // Buscar emails en asesores por nombre
      const { default: Asesor } = await import("../models/Asesor.js");
      const asesores = await Asesor.find({ activo: true }).select("nombre email");

      const emails = [];
      for (const u of destinatarios) {
        const asesor = asesores.find(a =>
          a.nombre.toLowerCase().includes(u.nombre.split(" ")[0].toLowerCase())
        );
        if (asesor?.email) emails.push({ nombre: u.nombre, email: asesor.email });
      }

      if (emails.length > 0) {
        await enviarEmailCierreServicio(emails, servicio);
      }
    } catch (emailErr) {
      console.error("Error enviando email de cierre:", emailErr.message);
    }

    res.json(servicio);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}