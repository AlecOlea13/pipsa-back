import CuentaCobrar from "../models/CuentaCobrar.js";
import { enviarEmailCobro } from "../utils/mailer.js";

export async function getCxcs(req, res) {
  try {
    const cxcs = await CuentaCobrar.find().sort({ fechaEmision: -1 });
    res.json(cxcs);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createCxc(req, res) {
  try {
    const body = { ...req.body };
    const cxc = new CuentaCobrar(body);
    await cxc.save();
    res.status(201).json(cxc);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: "Esta factura ya fue registrada (UUID duplicado)" });
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateCxc(req, res) {
  try {
    const cxc = await CuentaCobrar.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cxc) return res.status(404).json({ message: "Cuenta por cobrar no encontrada" });
    res.json(cxc);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function deleteCxc(req, res) {
  try {
    await CuentaCobrar.findByIdAndDelete(req.params.id);
    res.json({ message: "Registro eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cobrarCxc(req, res) {
  try {
    const { fechaPago, complementoPago, comentarios } = req.body;
    const cxc = await CuentaCobrar.findByIdAndUpdate(
      req.params.id,
      {
        estatus:         "cobrada",
        fechaPago:       fechaPago ? new Date(fechaPago) : new Date(),
        complementoPago: complementoPago ?? null,
        comentarios:     comentarios ?? "",
      },
      { new: true }
    );
    if (!cxc) return res.status(404).json({ message: "Cuenta por cobrar no encontrada" });

    try {
      await enviarEmailCobro({
        cliente:    cxc.nombreReceptor ?? "—",
        folio:      cxc.folioFactura   ?? cxc.uuid?.slice(0, 8) ?? "—",
        total:      cxc.total,
        fechaPago:  cxc.fechaPago,
        complemento: complementoPago ?? null,
      });
    } catch (mailErr) {
      console.error("Error enviando email de cobro:", mailErr.message);
    }

    res.json(cxc);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cobrarPorRep(req, res) {
  try {
    const { pagos, fechaPago, complementoPago } = req.body;
    // pagos = [{ uuid, montoPagado }]
    if (!pagos?.length) return res.status(400).json({ message: "Sin pagos para procesar" });

    const resultados = [];

    for (const pago of pagos) {
      const cxc = await CuentaCobrar.findOne({ uuid: pago.uuid });

      if (!cxc) {
        resultados.push({ uuid: pago.uuid, encontrada: false });
        continue;
      }

      if (cxc.estatus === "cobrada") {
        resultados.push({ uuid: pago.uuid, encontrada: true, yaEstaba: true, folioFactura: cxc.folioFactura, nombreReceptor: cxc.nombreReceptor });
        continue;
      }

      cxc.estatus         = "cobrada";
      cxc.fechaPago       = fechaPago ? new Date(fechaPago) : new Date();
      cxc.complementoPago = complementoPago ?? null;
      await cxc.save();

      try {
        await enviarEmailCobro({
          cliente:     cxc.nombreReceptor ?? "—",
          folio:       cxc.folioFactura ?? cxc.uuid?.slice(0, 8) ?? "—",
          total:       pago.montoPagado ?? cxc.total,
          fechaPago:   cxc.fechaPago,
          complemento: complementoPago ?? null,
        });
      } catch (mailErr) {
        console.error("Error enviando email de cobro automático:", mailErr.message);
      }

      resultados.push({
        uuid: pago.uuid,
        encontrada: true,
        yaEstaba: false,
        folioFactura: cxc.folioFactura,
        nombreReceptor: cxc.nombreReceptor,
        total: cxc.total,
      });
    }

    res.json({ resultados });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}