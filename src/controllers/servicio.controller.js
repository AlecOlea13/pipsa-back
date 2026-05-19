import Servicio from "../models/Servicio.js";
import Montacargas from "../models/Montacargas.js";
import OrdenRefaccion from "../models/OrdenRefaccion.js";
import TipoServicio from "../models/TipoServicio.js";
import CatalogoEquipo from "../models/CatalogoEquipo.js";

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
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("cliente", "nombre")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate("ordenRefaccion")
      .sort({ createdAt: -1 });
    res.json(servicios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServicio(req, res) {
  try {
    const servicio = await Servicio.findById(req.params.id)
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("cliente", "nombre")
      .populate("tipoServicio", "nombre")
      .populate("tecnicoAsignado", "nombre")
      .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad" } });
    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createServicio(req, res) {
  try {
    const folio = await generarFolioServicio();
    const servicio = new Servicio({ ...req.body, folio });
    await servicio.save();

    // Cambiar estatus del montacargas
    await Montacargas.findByIdAndUpdate(req.body.montacargas, { estatus: "mantenimiento" });

    // Generar orden de refacciones si hay tipo de servicio
    let ordenId = null;
    if (req.body.tipoServicio) {
      // Buscar catálogo personalizado del equipo
      const catalogo = await CatalogoEquipo.findOne({ montacargas: req.body.montacargas })
        .populate("refacciones.refaccion");

      // Si tiene catálogo propio, usar ese; si no, usar el del tipo de servicio
      let refacciones = [];
      if (catalogo && catalogo.refacciones.length > 0) {
        refacciones = catalogo.refacciones;
      } else {
        const tipo = await TipoServicio.findById(req.body.tipoServicio);
        refacciones = tipo?.refacciones ?? [];
      }

      if (refacciones.length > 0) {
        const folioOrden = await generarFolioOrden();
        const orden = await OrdenRefaccion.create({
          folio: folioOrden,
          servicio: servicio._id,
          montacargas: req.body.montacargas,
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
    const { horometro, proximoServicio, estatusMonta, notasCierre } = req.body;
    const servicio = await Servicio.findByIdAndUpdate(
      req.params.id,
      { estatus: "cerrado", horometroCierre: horometro, proximoServicio, notasCierre },
      { new: true }
    ).populate("montacargas", "numeroEconomico marca modelo")
     .populate("cliente", "nombre")
     .populate("tipoServicio", "nombre")
     .populate("tecnicoAsignado", "nombre")
     .populate({ path: "ordenRefaccion", populate: { path: "items.refaccion", select: "nombre numeroParte unidad precio" } });

    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });

    await Montacargas.findByIdAndUpdate(servicio.montacargas, {
      horometroActual: horometro,
      fechaUltimoServicio: new Date(),
      proximoServicio,
      estatus: estatusMonta || "disponible",
    });

    res.json(servicio);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}