import Gasto from "../models/Gasto.js";
import Proveedor from "../models/Proveedor.js";
import { enviarEmailPago } from "../utils/mailer.js";

async function matchProveedor(rfcEmisor, proveedorManual) {
  if (proveedorManual) return proveedorManual;
  if (!rfcEmisor) return null;
  const p = await Proveedor.findOne({ rfc: rfcEmisor.trim(), activo: true });
  return p?._id ?? null;
}

export async function getGastos(req, res) {
  try {
    const gastos = await Gasto.find()
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email")
      .sort({ fechaEmision: -1 });
    res.json(gastos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createGasto(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor) delete body.asesor;
    body.proveedor = await matchProveedor(body.rfcEmisor, body.proveedor || null);
    const gasto = new Gasto(body);
    await gasto.save();
    await gasto.populate([
      { path: "asesor",    select: "nombre" },
      { path: "proveedor", select: "nombre email" },
    ]);
    res.status(201).json(gasto);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Este XML ya fue registrado (UUID duplicado)" });
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateGasto(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor) delete body.asesor;
    body.proveedor = await matchProveedor(body.rfcEmisor, body.proveedor || null);
    const gasto = await Gasto.findByIdAndUpdate(req.params.id, body, { new: true })
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email");
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });
    res.json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteGasto(req, res) {
  try {
    await Gasto.findByIdAndDelete(req.params.id);
    res.json({ message: "Gasto eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function pagarGasto(req, res) {
  try {
    const { fechaPago, comprobantePago, complementoXml } = req.body;
    const gasto = await Gasto.findByIdAndUpdate(
      req.params.id,
      {
        estatus:         "pagado",
        fechaPago:       fechaPago       ? new Date(fechaPago) : new Date(),
        comprobantePago: comprobantePago ?? null,
        complementoXml:  complementoXml  ?? null,
      },
      { new: true }
    )
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email");
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });

    try {
      const emailProveedor = gasto.proveedor?.email ?? null;
      await enviarEmailPago({
        tipo:          "fiscal",
        proveedor:     gasto.nombreEmisor ?? "—",
        total:         gasto.total,
        fechaPago:     gasto.fechaPago,
        comprobante:   comprobantePago ?? null,
        emailProveedor,
      });
    } catch (mailErr) {
      console.error("Error enviando email de pago:", mailErr.message);
    }

    res.json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}