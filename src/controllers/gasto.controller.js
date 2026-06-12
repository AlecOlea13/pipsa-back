import Gasto from "../models/Gasto.js";
import Proveedor from "../models/Proveedor.js";
import { enviarEmailPago, enviarEmailPagoMultiple } from "../utils/mailer.js";

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
    if (!body.asesor)    delete body.asesor;
    body.proveedor = await matchProveedor(body.rfcEmisor, body.proveedor || null);
    const gasto = await Gasto.findByIdAndUpdate(req.params.id, body, { new: true })
      .populate("asesor",    "nombre")
      .populate("proveedor", "nombre email");
    if (!gasto) return res.status(404).json({ message: "Gasto no encontrado" });

    if (body.comprobantePago && gasto.estatus === "pagado") {
      try {
        const emailProveedor = gasto.proveedor?.email ?? null;
        await enviarEmailPago({
          tipo:          "fiscal",
          proveedor:     gasto.nombreEmisor ?? "—",
          folio:         gasto.folioFactura ?? null,
          total:         gasto.total,
          fechaPago:     gasto.fechaPago,
          comprobante:   body.comprobantePago,
          emailProveedor,
        });
      } catch (mailErr) {
        console.error("Error reenviando email con comprobante:", mailErr.message);
      }
    }

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
        folio:         gasto.folioFactura ?? null,
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

export async function pagarGastoMultiple(req, res) {
  try {
    const { ids, fechaPago, comprobantePago, complementoXml } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "Sin facturas seleccionadas" });

    const fecha = fechaPago ? new Date(fechaPago) : new Date();
    const gastos = [];

    for (const id of ids) {
      const g = await Gasto.findByIdAndUpdate(
        id,
        {
          estatus:         "pagado",
          fechaPago:       fecha,
          comprobantePago: comprobantePago ?? null,
          complementoXml:  complementoXml  ?? null,
        },
        { new: true }
      )
        .populate("asesor",    "nombre")
        .populate("proveedor", "nombre email");
      if (g) gastos.push(g);
    }

    if (!gastos.length) return res.status(404).json({ message: "No se encontraron gastos" });

    try {
      const primerGasto    = gastos[0];
      const emailProveedor = primerGasto.proveedor?.email ?? null;
      const totalGeneral   = gastos.reduce((acc, g) => acc + g.total, 0);
      const facturas       = gastos.map(g => ({ folio: g.folioFactura ?? g._id, total: g.total }));

      await enviarEmailPagoMultiple({
        proveedor:     primerGasto.nombreEmisor ?? "—",
        facturas,
        totalGeneral,
        fechaPago:     fecha,
        comprobante:   comprobantePago ?? null,
        emailProveedor,
      });
    } catch (mailErr) {
      console.error("Error enviando email pago múltiple:", mailErr.message);
    }

    res.json(gastos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}