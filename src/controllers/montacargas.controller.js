import Montacargas from "../models/Montacargas.js";
import { buildMatchEquipos } from "../services/reporteVentasEquipos.service.js";

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
    const { estatus } = req.body;
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
export async function marcarVendido(req, res) {
  try {
    const { montoFacturado, montoEfectivo, numeroFactura, fecha, clienteId, clienteNombre, asesorId, notas } = req.body;

    const facturado = Number(montoFacturado) || 0;
    const efectivo  = Number(montoEfectivo)  || 0;

    if (facturado <= 0 && efectivo <= 0) {
      return res.status(400).json({ message: "Captura al menos un monto facturado o en efectivo" });
    }

    const iva     = parseFloat((facturado * 0.16).toFixed(2));
    const importe = parseFloat((facturado + iva + efectivo).toFixed(2));

    const monta = await Montacargas.findById(req.params.id);
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });

    if (monta.estatus === "vendido") {
      return res.status(400).json({ message: "Este equipo ya está marcado como vendido" });
    }

    monta.estatus       = "vendido";
    monta.clienteActual = null;
    monta.venta = {
      fecha:          fecha ? new Date(fecha) : new Date(),
      importe,
      montoFacturado: facturado,
      ivaFacturado:   iva,
      numeroFactura:  numeroFactura || "",
      montoEfectivo:  efectivo,
      cliente:        clienteId    || null,
      clienteNombre:  clienteNombre || "",
      asesor:         asesorId     || null,
      notas:          notas        || "",
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

// ── PUT /montacargas/:id/editar-venta ──
export async function editarVenta(req, res) {
  try {
    const { montoFacturado, montoEfectivo, numeroFactura, fecha, clienteId, clienteNombre, asesorId, notas } = req.body;

    const facturado = Number(montoFacturado) || 0;
    const efectivo  = Number(montoEfectivo)  || 0;

    if (facturado <= 0 && efectivo <= 0) {
      return res.status(400).json({ message: "Captura al menos un monto facturado o en efectivo" });
    }

    const monta = await Montacargas.findById(req.params.id);
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });

    if (monta.estatus !== "vendido") {
      return res.status(400).json({ message: "Este equipo no está marcado como vendido" });
    }

    const iva     = parseFloat((facturado * 0.16).toFixed(2));
    const importe = parseFloat((facturado + iva + efectivo).toFixed(2));

    monta.venta = {
      fecha:          fecha ? new Date(fecha) : monta.venta.fecha,
      importe,
      montoFacturado: facturado,
      ivaFacturado:   iva,
      numeroFactura:  numeroFactura || "",
      montoEfectivo:  efectivo,
      cliente:        clienteId    || null,
      clienteNombre:  clienteNombre || "",
      asesor:         asesorId     || null,
      notas:          notas        || "",
    };

    await monta.save();

    const populated = await Montacargas.findById(monta._id)
      .populate("venta.cliente", "nombre")
      .populate("venta.asesor", "nombre");

    res.json(populated);
  } catch (e) {
    console.error("Error editarVenta:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── POST /montacargas/:id/deshacer-venta ──
export async function deshacerVenta(req, res) {
  try {
    const monta = await Montacargas.findById(req.params.id);
    if (!monta) return res.status(404).json({ message: "Montacargas no encontrado" });

    if (monta.estatus !== "vendido") {
      return res.status(400).json({ message: "Este equipo no está marcado como vendido" });
    }

    monta.estatus = "disponible";
    monta.venta   = { fecha: null, importe: 0, cliente: null, clienteNombre: "", asesor: null, notas: "" };
    await monta.save();

    res.json(monta);
  } catch (e) {
    console.error("Error deshacerVenta:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── GET /montacargas/reporte-ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&asesorId=... ──
// Usa buildMatchEquipos() del service compartido → mismo filtro que el nuevo
// endpoint /api/reportes/ventas/equipos, garantizando conciliación exacta.
// El contrato de respuesta es idéntico al original: Montacargas.tsx no cambia.
export async function reporteVentas(req, res) {
  try {
    const { desde, hasta, asesorId } = req.query;

    // Mismo filtro MongoDB que usa el nuevo reporte — conciliación garantizada
    const filtro = buildMatchEquipos({ desde, hasta, asesorId });

    const vendidos = await Montacargas.find(filtro)
      .populate("venta.cliente", "nombre")
      .populate("venta.asesor", "nombre")
      .sort({ "venta.fecha": -1 });

    const totalImporte = vendidos.reduce((acc, m) => acc + (m.venta?.importe ?? 0), 0);

    const porAsesorMap = new Map();
    for (const m of vendidos) {
      const key    = m.venta?.asesor?._id?.toString() ?? "sin_asesor";
      const nombre = m.venta?.asesor?.nombre ?? "Sin asesor";
      if (!porAsesorMap.has(key)) porAsesorMap.set(key, { nombre, cantidad: 0, total: 0 });
      const g = porAsesorMap.get(key);
      g.cantidad += 1;
      g.total    += m.venta?.importe ?? 0;
    }

    res.json({
      equipos:      vendidos,
      totalEquipos: vendidos.length,
      totalImporte,
      porAsesor:    [...porAsesorMap.values()].sort((a, b) => b.total - a.total),
    });
  } catch (e) {
    console.error("Error reporteVentas:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}