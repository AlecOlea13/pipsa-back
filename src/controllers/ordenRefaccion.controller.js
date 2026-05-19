import OrdenRefaccion from "../models/OrdenRefaccion.js";
import Refaccion from "../models/Refaccion.js";
import Servicio from "../models/Servicio.js";

export async function getOrdenes(req, res) {
  try {
    const ordenes = await OrdenRefaccion.find()
      .populate("servicio", "folio problema")
      .populate("montacargas", "numeroEconomico marca")
      .populate("items.refaccion", "nombre numeroParte unidad")
      .populate("surtidoPor", "nombre")
      .sort({ createdAt: -1 });
    res.json(ordenes);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getOrden(req, res) {
  try {
    const orden = await OrdenRefaccion.findById(req.params.id)
      .populate("servicio", "folio problema fechaReporte")
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("items.refaccion", "nombre numeroParte unidad stock")
      .populate("surtidoPor", "nombre");
    if (!orden) return res.status(404).json({ message: "Orden no encontrada" });
    res.json(orden);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function surtirOrden(req, res) {
  try {
    const { items, notas } = req.body;
    const orden = await OrdenRefaccion.findById(req.params.id);
    if (!orden) return res.status(404).json({ message: "Orden no encontrada" });

    // Actualizar items y descontar stock
    for (const item of items) {
      const ordenItem = orden.items.find(i => i.refaccion.toString() === item.refaccionId);
      if (ordenItem) {
        ordenItem.cantidadSurtida = item.cantidadSurtida;
        ordenItem.confirmado = item.cantidadSurtida >= ordenItem.cantidadSolicitada;
        // Descontar stock
        await Refaccion.findByIdAndUpdate(item.refaccionId, {
          $inc: { stock: -item.cantidadSurtida }
        });
      }
    }

    // Actualizar estatus de la orden
    const todosConfirmados = orden.items.every(i => i.confirmado);
    const algunoConfirmado = orden.items.some(i => i.cantidadSurtida > 0);
    orden.estatus = todosConfirmados ? "surtida" : algunoConfirmado ? "parcial" : "pendiente";
    orden.notas = notas ?? orden.notas;
    orden.surtidoPor = req.userId;
    orden.fechaSurtido = new Date();
    await orden.save();

    // Actualizar costo de refacciones en el servicio
    const costoTotal = await calcularCostoOrden(orden);
    await Servicio.findByIdAndUpdate(orden.servicio, { costoRefacciones: costoTotal });

    res.json(orden);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

async function calcularCostoOrden(orden) {
  let total = 0;
  for (const item of orden.items) {
    const ref = await Refaccion.findById(item.refaccion);
    if (ref) total += ref.precio * item.cantidadSurtida;
  }
  return total;
}