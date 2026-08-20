import Renta from "../models/Renta.js";
import Montacargas from "../models/Montacargas.js";
import Cliente from "../models/Cliente.js";

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
    const body = { ...req.body };

    if (body.cliente?._id) body.cliente = body.cliente._id;
    if (body.montacargas?._id) body.montacargas = body.montacargas._id;
    if (body.asesor?._id) body.asesor = body.asesor._id;
    if (!body.asesor) delete body.asesor;

    const rentaAnterior = await Renta.findById(req.params.id);
    if (!rentaAnterior) return res.status(404).json({ message: "Renta no encontrada" });

    const renta = await Renta.findByIdAndUpdate(req.params.id, body, { new: true });

    // ── Sincronizar montacargas si el estatus cambió a terminada ──
    if (body.estatus === "terminada" && rentaAnterior.estatus !== "terminada") {
      await Montacargas.findByIdAndUpdate(renta.montacargas, {
        clienteActual: null,
        estatus: "disponible",
      });
    }

    // ── Sincronizar montacargas si el estatus cambió de terminada a activa ──
    if (body.estatus === "activa" && rentaAnterior.estatus === "terminada") {
      await Montacargas.findByIdAndUpdate(renta.montacargas, {
        clienteActual: renta.cliente,
        estatus: "rentado",
      });
    }

    // ── Si cambió el montacargas de la renta, liberar el anterior y ocupar el nuevo ──
    if (body.montacargas && String(body.montacargas) !== String(rentaAnterior.montacargas) && renta.estatus === "activa") {
      await Montacargas.findByIdAndUpdate(rentaAnterior.montacargas, {
        clienteActual: null,
        estatus: "disponible",
      });
      await Montacargas.findByIdAndUpdate(renta.montacargas, {
        clienteActual: renta.cliente,
        estatus: "rentado",
      });
    }

    res.json(renta);
  } catch (e) {
    console.error("updateRenta error:", e.message);
    res.status(500).json({ message: "Error en el servidor", detail: e.message });
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
    renta.estatus       = "activa";
    await renta.save();

    // ── Asegurar que el montacargas quede sincronizado como rentado ──
    await Montacargas.findByIdAndUpdate(renta.montacargas, {
      clienteActual: renta.cliente,
      estatus: "rentado",
    });

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

// export async function buscarRentasPorRfc(req, res) {
//   try {
//     const { rfc } = req.body;
//     if (!rfc) return res.status(400).json({ message: "RFC requerido" });

//     const cliente = await Cliente.findOne({ rfc: rfc.trim().toUpperCase() });
//     if (!cliente) return res.json({ rentas: [], clienteNombre: null });

//     const rentas = await Renta.find({
//       cliente: cliente._id,
//       estatus: { $in: ["activa", "vencida"] },
//     })
//       .populate("montacargas", "numeroEconomico marca modelo")
//       .populate("cliente", "nombre");

//     res.json({ rentas, clienteNombre: cliente.nombre });
//   } catch (e) {
//     res.status(500).json({ message: "Error en el servidor" });
//   }
// }

// momentaneo
export async function buscarRentasPorRfc(req, res) {
  try {
    const { rfc } = req.body;
    console.log("RFC recibido:", rfc);
    
    const cliente = await Cliente.findOne({ rfc: rfc.trim().toUpperCase() });
    console.log("Cliente encontrado:", cliente?.nombre, "| RFC en BD:", cliente?.rfc);
    
    if (!cliente) return res.json({ rentas: [], clienteNombre: null });

    const rentas = await Renta.find({
      cliente: cliente._id,
      estatus: { $in: ["activa", "vencida"] },
    })
      .populate("montacargas", "numeroEconomico marca modelo")
      .populate("cliente", "nombre");

    console.log("Rentas encontradas:", rentas.length);
    res.json({ rentas, clienteNombre: cliente.nombre });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}