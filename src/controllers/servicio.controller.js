import Servicio from "../models/Servicio.js";
import Montacargas from "../models/Montacargas.js";
import OrdenRefaccion from "../models/OrdenRefaccion.js";
import TipoServicio from "../models/TipoServicio.js";
import CatalogoEquipo from "../models/CatalogoEquipo.js";
import { enviarEmailCierreServicio, enviarEmailPausaServicio } from "../utils/mailer.js";

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
    const filtro = {};
    if (req.userRol === "tecnico") filtro.tecnicoAsignado = req.userId;
    const servicios = await Servicio.find(filtro)
      .populate("montacargas", "numeroEconomico marca modelo serie")
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } })
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
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    if (req.userRol === "tecnico" && String(servicio.tecnicoAsignado?._id) !== String(req.userId))
      return res.status(403).json({ message: "No tienes permiso para ver este servicio" });
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

    const folio    = await generarFolioServicio();
    const servicio = new Servicio({ ...body, folio });
    await servicio.save();
    await Montacargas.findByIdAndUpdate(body.montacargas, { estatus: "mantenimiento" });

    let ordenId = null;
    if (body.tipoServicio) {
      const catalogo = await CatalogoEquipo.findOne({ montacargas: body.montacargas }).populate("refacciones.refaccion");
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
    const servicio = await Servicio.findById(req.params.id);
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    if (req.userRol === "tecnico" && String(servicio.tecnicoAsignado) !== String(req.userId))
      return res.status(403).json({ message: "No tienes permiso para modificar este servicio" });
    const actualizado = await Servicio.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(actualizado);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function iniciarServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id);
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    const puedeIniciar =
      ["developer", "gerencia"].includes(req.userRol) ||
      (req.userRol === "tecnico" && String(servicio.tecnicoAsignado) === String(req.userId));
    if (!puedeIniciar) return res.status(403).json({ message: "No tienes permiso para iniciar este servicio" });
    if (servicio.horaInicio) return res.status(400).json({ message: "Este servicio ya fue iniciado" });

    servicio.horaInicio = new Date();
    servicio.estatus    = "en_proceso";

    // Guardar ubicación de inicio si viene en el body
    if (req.body.ubicacion?.lat && req.body.ubicacion?.lng) {
      servicio.ubicacionInicio = {
        lat: req.body.ubicacion.lat,
        lng: req.body.ubicacion.lng,
      };
    }

    await servicio.save();
    await servicio.populate([
      { path: "montacargas", select: "numeroEconomico marca modelo serie" },
      { path: "cliente", select: "nombre direccion telefono" },
      { path: "tipoServicio", select: "nombre" },
      { path: "tecnicoAsignado", select: "nombre" },
    ]);
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function pausarServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id);
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    const puedePausar =
      ["developer", "gerencia"].includes(req.userRol) ||
      (req.userRol === "tecnico" && String(servicio.tecnicoAsignado) === String(req.userId));
    if (!puedePausar) return res.status(403).json({ message: "No tienes permiso para pausar este servicio" });
    if (servicio.estatus !== "en_proceso") return res.status(400).json({ message: "Solo se puede pausar un servicio en proceso" });
    const { razon } = req.body;
    if (!razon?.trim()) return res.status(400).json({ message: "La razón de pausa es obligatoria" });

    servicio.pausas.push({ razon: razon.trim(), horaInicio: new Date() });
    servicio.estatus = "pausado";
    await servicio.save();
    await servicio.populate([
      { path: "montacargas", select: "numeroEconomico marca modelo serie" },
      { path: "cliente", select: "nombre direccion telefono" },
      { path: "tipoServicio", select: "nombre" },
      { path: "tecnicoAsignado", select: "nombre" },
    ]);
    try {
      const destinatarios = [
        { nombre: "Richard",   email: "richard@pipsamontacargas.com" },
        { nombre: "Juan",      email: "juan@pipsamontacargas.com" },
        { nombre: "Alejandro", email: "alejandropipsa@hotmail.com" },
      ];
      await enviarEmailPausaServicio(destinatarios, servicio, razon.trim());
    } catch (emailErr) {
      console.error("Error enviando email de pausa:", emailErr.message);
    }
    res.json(servicio);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function reanudarServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id);
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    const puedeReanudar =
      ["developer", "gerencia"].includes(req.userRol) ||
      (req.userRol === "tecnico" && String(servicio.tecnicoAsignado) === String(req.userId));
    if (!puedeReanudar) return res.status(403).json({ message: "No tienes permiso para reanudar este servicio" });
    if (servicio.estatus !== "pausado") return res.status(400).json({ message: "Solo se puede reanudar un servicio pausado" });

    const pausaActiva = servicio.pausas.find(p => !p.horaFin);
    if (pausaActiva) pausaActiva.horaFin = new Date();
    servicio.estatus = "en_proceso";
    await servicio.save();
    await servicio.populate([
      { path: "montacargas", select: "numeroEconomico marca modelo serie" },
      { path: "cliente", select: "nombre direccion telefono" },
      { path: "tipoServicio", select: "nombre" },
      { path: "tecnicoAsignado", select: "nombre" },
    ]);
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cerrarServicio(req, res) {
  try {
    const servicioActual = await Servicio.findById(req.params.id);
    if (!servicioActual) return res.status(404).json({ message: "Servicio no encontrado" });
    const puedeCerrar =
      ["developer", "gerencia"].includes(req.userRol) ||
      (req.userRol === "tecnico" && String(servicioActual.tecnicoAsignado) === String(req.userId));
    if (!puedeCerrar) return res.status(403).json({ message: "No tienes permiso para cerrar este servicio" });

    const {
      horometro, proximoServicio, estatusMonta,
      notasCierre, fotoHojaFirmada, fotoEquipoFinal, fotoRefacciones,
      ubicacion,
    } = req.body;

    const updateData = {
      estatus: "cerrado",
      horometroCierre: horometro,
      proximoServicio,
      notasCierre,
      fotoHojaFirmada:  fotoHojaFirmada  ?? null,
      fotoEquipoFinal:  fotoEquipoFinal  ?? null,
      fotoRefacciones:  fotoRefacciones  ?? null,
      horaFin: new Date(),
    };

    if (ubicacion?.lat && ubicacion?.lng) {
      updateData.ubicacionCierre = { lat: ubicacion.lat, lng: ubicacion.lng };
    }

    const servicio = await Servicio.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate("montacargas", "numeroEconomico marca modelo serie")
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } });

    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });

    await Montacargas.findByIdAndUpdate(servicio.montacargas, {
    horometroActual: horometro,
    fechaUltimoServicio: new Date(),
    proximoServicio,
    // ✅ calcular próximo mantenimiento automáticamente: 1 mes después
    proximoMantenimiento: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    estatus: estatusMonta || "disponible",
    });

    try {
      const destinatarios = [
        { nombre: "Richard",   email: "richard@pipsamontacargas.com" },
        { nombre: "Juan",      email: "juan@pipsamontacargas.com" },
        { nombre: "Alejandro", email: "alejandropipsa@hotmail.com" },
      ];
      await enviarEmailCierreServicio(destinatarios, servicio);
    } catch (emailErr) {
      console.error("Error enviando email de cierre:", emailErr.message);
    }

    res.json(servicio);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServiciosPorMontacargas(req, res) {
  try {
    const servicios = await Servicio.find({ montacargas: req.params.montacargasId })
      .populate("cliente", "nombre")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .select("folio estatus fechaReporte problema notasCierre horometro horometroCierre horaInicio horaFin cliente tipoServicio tecnicoAsignado")
      .sort({ createdAt: -1 });
    res.json(servicios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}