import GastoNoFiscal from "../models/GastoNoFiscal.js";
import { enviarEmailPago } from "../utils/mailer.js";

export async function getGastosNoFiscales(req, res) {
  try {
    const gastos = await GastoNoFiscal.find()
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email")
      .sort({ fecha: -1 });
    res.json(gastos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createGastoNoFiscal(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor)    delete body.asesor;
    if (!body.proveedor) delete body.proveedor;
    const gasto = new GastoNoFiscal(body);
    await gasto.save();
    await gasto.populate([
      { path: "asesor",    select: "nombre" },
      { path: "proveedor", select: "nombre email" },
    ]);
    res.status(201).json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateGastoNoFiscal(req, res) {
  try {
    const body = { ...req.body };
    if (!body.asesor)    delete body.asesor;
    if (!body.proveedor) delete body.proveedor;
    const gasto = await GastoNoFiscal.findByIdAndUpdate(req.params.id, body, { new: true })
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email");
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });
    res.json(gasto);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteGastoNoFiscal(req, res) {
  try {
    await GastoNoFiscal.findByIdAndDelete(req.params.id);
    res.json({ message: "Gasto eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function pagarGastoNoFiscal(req, res) {
  try {
    const { fechaPago, comprobantePago } = req.body;
    const gasto = await GastoNoFiscal.findByIdAndUpdate(
      req.params.id,
      {
        estatus:         "pagado",
        fechaPago:       fechaPago       ? new Date(fechaPago) : new Date(),
        comprobantePago: comprobantePago ?? null,
      },
      { new: true }
    )
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email");
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });

    try {
      const emailProveedor = gasto.proveedor?.email ?? null;
      await enviarEmailPago({
      tipo:          "no fiscal",
      proveedor:     gasto.descripcion,
      folio:         null,
      total:         gasto.monto,
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