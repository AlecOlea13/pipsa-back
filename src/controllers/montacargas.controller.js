import Montacargas from "../models/Montacargas.js";

export async function getMontacargas(req, res) {
  try {
    const montas = await Montacargas.find()
      .populate("clienteActual", "nombre")
      .populate("venta.cliente", "nombre")
      .populate("venta.asesor", "nombre")
      .sort({ numeroEconomico: 1 });
    res.json(montas);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getMonta(req, res) {
  try {
    const monta = await Montacargas.findById(req.params.id)
      .populate("clienteActual", "nombre")
      .populate("venta.cliente", "nombre")
      .populate("venta.asesor", "nombre");
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createMonta(req, res) {
  try {
    const monta = new Montacargas(req.body);
    await monta.save();
    res.status(201).json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateMonta(req, res) {
  try {
    const monta = await Montacargas.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteMonta(req, res) {
  try {
    await Montacargas.findByIdAndDelete(req.params.id);
    res.json({ message: "Montacargas eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function asignarCliente(req, res) {
  try {
    const { clienteId } = req.body;
    const monta = await Montacargas.findByIdAndUpdate(
      req.params.id,
      { clienteActual: clienteId, estatus: "rentado" },
      { new: true }
    ).populate("clienteActual", "nombre");
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function regresarMonta(req, res) {
  try {
    const { estatus } = req.body; // "disponible" o "taller"
    const monta = await Montacargas.findByIdAndUpdate(
      req.params.id,
      { clienteActual: null, estatus: estatus || "disponible" },
      { new: true }
    );
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });
    res.json(monta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── POST /montacargas/:id/vender ──
// Marca el equipo como vendido: sale del catálogo/inventario activo,
// guarda importe, fecha, cliente (o nombre libre) y asesor que hizo la venta.
export async function marcarVendido(req, res) {
  try {
    const { importe, fecha, clienteId, clienteNombre, asesorId, notas } = req.body;

    if (!importe || Number(importe) <= 0) {
      return res.status(400).json({ message: "El importe de venta es requerido y debe ser mayor a 0" });
    }

    const monta = await Montacargas.findById(req.params.id);
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });

    if (monta.estatus === "vendido") {
      return res.status(400).json({ message: "Este equipo ya está marcado como vendido" });
    }

    monta.estatus = "vendido";
    monta.clienteActual = null; // ya no está rentado a nadie
    monta.venta = {
      fecha: fecha ? new Date(fecha) : new Date(),
      importe: Number(importe),
      cliente: clienteId || null,
      clienteNombre: clienteNombre || "",
      asesor: asesorId || null,
      notas: notas || "",
    };

    await monta.save();

    const populated = await Montacargas.findById(monta._id)
      .populate("venta.cliente", "nombre")
      .populate("venta.asesor", "nombre");

    res.json(populated);
  } catch (e) {
    console.error("Error marcarVendido:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── POST /montacargas/:id/deshacer-venta ──
// Revierte una venta por error de captura: regresa el equipo a "disponible"
// y limpia los datos de venta.
export async function deshacerVenta(req, res) {
  try {
    const monta = await Montacargas.findById(req.params.id);
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });

    if (monta.estatus !== "vendido") {
      return res.status(400).json({ message: "Este equipo no está marcado como vendido" });
    }

    monta.estatus = "disponible";
    monta.venta = { fecha: null, importe: 0, cliente: null, clienteNombre: "", asesor: null, notas: "" };
    await monta.save();

    res.json(monta);
  } catch (e) {
    console.error("Error deshacerVenta:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── GET /montacargas/reporte-ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&asesorId=... ──
// Reporte de equipos vendidos filtrable por rango de fechas y opcionalmente por asesor.
// Devuelve el listado + totales, listo para pintar tabla y tarjetas de resumen.
export async function reporteVentas(req, res) {
  try {
    const { desde, hasta, asesorId } = req.query;

    const filtro = { estatus: "vendido" };

    if (desde || hasta) {
      filtro["venta.fecha"] = {};
      if (desde) filtro["venta.fecha"].$gte = new Date(desde + "T00:00:00");
      if (hasta) filtro["venta.fecha"].$lte = new Date(hasta + "T23:59:59");
    }

    if (asesorId) filtro["venta.asesor"] = asesorId;

    const vendidos = await Montacargas.find(filtro)
      .populate("venta.cliente", "nombre")
      .populate("venta.asesor", "nombre")
      .sort({ "venta.fecha": -1 });

    const totalImporte = vendidos.reduce((acc, m) => acc + (m.venta?.importe ?? 0), 0);

    // Agrupado por asesor, útil para el reporte
    const porAsesorMap = new Map();
    for (const m of vendidos) {
      const key    = m.venta?.asesor?._id?.toString() ?? "sin_asesor";
      const nombre = m.venta?.asesor?.nombre ?? "Sin asesor";
      if (!porAsesorMap.has(key)) porAsesorMap.set(key, { nombre, cantidad: 0, total: 0 });
      const g = porAsesorMap.get(key);
      g.cantidad += 1;
      g.total += m.venta?.importe ?? 0;
    }

    res.json({
      equipos: vendidos,
      totalEquipos: vendidos.length,
      totalImporte,
      porAsesor: [...porAsesorMap.values()].sort((a, b) => b.total - a.total),
    });
  } catch (e) {
    console.error("Error reporteVentas:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}