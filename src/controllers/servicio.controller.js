import Servicio from "../models/Servicio.js";
import Montacargas from "../models/Montacargas.js";
import EquipoCliente from "../models/EquipoCliente.js";
import OrdenRefaccion from "../models/OrdenRefaccion.js";
import TipoServicio from "../models/TipoServicio.js";
import CatalogoEquipo from "../models/CatalogoEquipo.js";
import { enviarEmailCierreServicio, enviarEmailPausaServicio } from "../utils/mailer.js";

const SEL_MONTA   = "numeroEconomico marca modelo serie";
const SEL_EQ_CLI  = "numeroEconomico marca modelo serie";

/**
 * Para que el frontend, los PDFs y los correos (que leen servicio.montacargas.*)
 * funcionen igual con equipos del cliente, un servicio de equipo del cliente se
 * devuelve con `montacargas` = datos del equipo del cliente + esDeCliente:true.
 * `equipoCliente` se conserva intacto por si se necesita distinguir.
 */
function conEquipo(servicio) {
  if (!servicio) return servicio;
  const o = typeof servicio.toObject === "function" ? servicio.toObject() : { ...servicio };
  if (!o.montacargas && o.equipoCliente && typeof o.equipoCliente === "object") {
    o.montacargas = { ...o.equipoCliente, esDeCliente: true };
  }
  return o;
}

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
      .populate("montacargas", SEL_MONTA)
      .populate("equipoCliente", SEL_EQ_CLI)
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } })
      .sort({ createdAt: -1 });
    res.json(servicios.map(conEquipo));
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id)
      .populate("montacargas", SEL_MONTA)
      .populate("equipoCliente", SEL_EQ_CLI)
      .populate("cliente", "nombre direccion telefono")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    if (req.userRol === "tecnico" && String(servicio.tecnicoAsignado?._id) !== String(req.userId))
      return res.status(403).json({ message: "No tienes permiso para ver este servicio" });
    res.json(conEquipo(servicio));
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

    // Exactamente uno: equipo Pipsa o equipo del cliente
    const tieneMonta = !!body.montacargas;
    const tieneEqCli = !!body.equipoCliente;
    if (tieneMonta === tieneEqCli)
      return res.status(400).json({ message: "Selecciona un equipo: Pipsa o del cliente (uno solo)" });
    if (tieneMonta) delete body.equipoCliente; else delete body.montacargas;

    if (tieneEqCli) {
      const eq = await EquipoCliente.findById(body.equipoCliente).select("cliente");
      if (!eq) return res.status(404).json({ message: "Equipo del cliente no encontrado" });
      if (!body.cliente) body.cliente = eq.cliente; // el dueño es el cliente del servicio
    }

    const folio    = await generarFolioServicio();
    const servicio = new Servicio({ ...body, folio });
    await servicio.save();

    // Estatus de disponibilidad / orden de refacciones solo aplican a inventario Pipsa
    let ordenId = null;
    if (tieneMonta) {
      await Montacargas.findByIdAndUpdate(body.montacargas, { estatus: "mantenimiento" });

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
            items: refacciones
              .filter(r => r.refaccion)
              .map(r => ({
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

    const body = { ...req.body };
    // Mantener la regla "uno u otro" si cambian el equipo desde la edición
    if (body.equipoCliente) body.montacargas = null;
    else if (body.montacargas) body.equipoCliente = null;
    else { delete body.montacargas; delete body.equipoCliente; }

    const actualizado = await Servicio.findByIdAndUpdate(req.params.id, body, { new: true });
    res.json(actualizado);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

const POPULATE_ACCION = [
  { path: "montacargas",     select: SEL_MONTA },
  { path: "equipoCliente",   select: SEL_EQ_CLI },
  { path: "cliente",         select: "nombre direccion telefono" },
  { path: "tipoServicio",    select: "nombre" },
  { path: "tecnicoAsignado", select: "nombre" },
];

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

    if (req.body.ubicacion?.lat && req.body.ubicacion?.lng) {
      servicio.ubicacionInicio = {
        lat: req.body.ubicacion.lat,
        lng: req.body.ubicacion.lng,
      };
    }

    await servicio.save();
    await servicio.populate(POPULATE_ACCION);
    res.json(conEquipo(servicio));
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
    await servicio.populate(POPULATE_ACCION);
    const plano = conEquipo(servicio);
    try {
      const destinatarios = [
        { nombre: "Richard",   email: "richard@pipsamontacargas.com" },
        { nombre: "Juan",      email: "juan@pipsamontacargas.com" },
        { nombre: "Alejandro", email: "alejandropipsa@hotmail.com" },
      ];
      await enviarEmailPausaServicio(destinatarios, plano, razon.trim());
    } catch (emailErr) {
      console.error("Error enviando email de pausa:", emailErr.message);
    }
    res.json(plano);
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
    await servicio.populate(POPULATE_ACCION);
    res.json(conEquipo(servicio));
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
      horometro,
      notasCierre, fotoHojaFirmada, fotoEquipoFinal, fotoRefacciones,
      firmaCliente,
      ubicacion,
    } = req.body;

    const esEquipoCliente = !servicioActual.montacargas && !!servicioActual.equipoCliente;

    // Equipo Pipsa: determinar el estatus al que debe regresar.
    // Con cliente asignado → "rentado". Sin cliente → "disponible".
    let estatusRegreso = null;
    if (!esEquipoCliente) {
      const montaActual = await Montacargas.findById(servicioActual.montacargas).select("clienteActual");
      estatusRegreso = montaActual?.clienteActual ? "rentado" : "disponible";
    }

    const updateData = {
      estatus:        "cerrado",
      horometroCierre: horometro,
      notasCierre,
      fotoHojaFirmada:  fotoHojaFirmada  ?? null,
      fotoEquipoFinal:  Array.isArray(fotoEquipoFinal)
        ? fotoEquipoFinal
        : (fotoEquipoFinal ? [fotoEquipoFinal] : []),
      fotoRefacciones:  fotoRefacciones  ?? null,
      firmaCliente:     firmaCliente     ?? null,
      horaFin:          new Date(),
    };

    if (ubicacion?.lat && ubicacion?.lng) {
      updateData.ubicacionCierre = { lat: ubicacion.lat, lng: ubicacion.lng };
    }

    const servicio = await Servicio.findByIdAndUpdate(req.params.id, updateData, { new: true })
      .populate("montacargas",   SEL_MONTA)
      .populate("equipoCliente", SEL_EQ_CLI)
      .populate("cliente",     "nombre direccion telefono email")
      .populate("tipoServicio",    "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } });

    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });

    if (esEquipoCliente) {
      await EquipoCliente.findByIdAndUpdate(servicioActual.equipoCliente, {
        horometroActual:     horometro,
        fechaUltimoServicio: new Date(),
      });
    } else {
      await Montacargas.findByIdAndUpdate(servicio.montacargas, {
        horometroActual:      horometro,
        fechaUltimoServicio:  new Date(),
        proximoMantenimiento: new Date(new Date().setMonth(new Date().getMonth() + 1)),
        estatus:              estatusRegreso,
      });
    }

    const plano = conEquipo(servicio);
    try {
      const destinatarios = [
        { nombre: "Richard",   email: "richard@pipsamontacargas.com" },
        { nombre: "Juan",      email: "juan@pipsamontacargas.com" },
        { nombre: "Alejandro", email: "alejandropipsa@hotmail.com" },
      ];
      await enviarEmailCierreServicio(destinatarios, plano);
    } catch (emailErr) {
      console.error("Error enviando email de cierre:", emailErr.message);
    }

    res.json(plano);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServiciosPorMontacargas(req, res) {
  try {
    const servicios = await Servicio.find({ montacargas: req.params.montacargasId })
      .populate("cliente",        "nombre")
      .populate("tipoServicio",   "nombre")
      .populate("tecnicoAsignado","nombre")
      .select("folio estatus fechaReporte problema notasCierre horometro horometroCierre horaInicio horaFin cliente tipoServicio tecnicoAsignado")
      .sort({ createdAt: -1 });
    res.json(servicios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function eliminarServicio(req, res) {
  try {
    const servicio = await Servicio.findByIdAndDelete(req.params.id);
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    res.json({ message: "Servicio eliminado correctamente" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al eliminar el servicio" });
  }
}