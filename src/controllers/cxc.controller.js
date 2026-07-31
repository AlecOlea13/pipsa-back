import CuentaCobrar from "../models/CuentaCobrar.js";
import { enviarEmailCobro, enviarEmailCobroMultiple } from "../utils/mailer.js";

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

// ── Cobro simple o parcial ──
export async function cobrarCxc(req, res) {
  try {
    const { fechaPago, complementoPago, comentarios, montoParcial } = req.body;
    const cxc = await CuentaCobrar.findById(req.params.id);
    if (!cxc) return res.status(404).json({ message: "Cuenta por cobrar no encontrada" });
    if (cxc.estatus === "cobrada") return res.status(400).json({ message: "Esta factura ya está cobrada" });
    if (cxc.estatus === "cancelada") return res.status(400).json({ message: "Esta factura está cancelada" });

    const fecha = fechaPago ? new Date(fechaPago) : new Date();
    const monto = montoParcial ? Number(montoParcial) : (cxc.total - (cxc.montoPagado ?? 0));

    if (monto <= 0) return res.status(400).json({ message: "El monto debe ser mayor a 0" });

    // Registrar pago en historial
    cxc.pagos.push({
      monto,
      fechaPago: fecha,
      complementoPago: complementoPago ?? null,
      comentarios: comentarios ?? "",
    });

    cxc.montoPagado     = (cxc.montoPagado ?? 0) + monto;
    cxc.fechaPago       = fecha;
    if (complementoPago) cxc.complementoPago = complementoPago;
    if (comentarios)     cxc.comentarios     = comentarios;

    // Determinar estatus según lo pagado
    if (cxc.montoPagado >= cxc.total) {
      cxc.montoPagado = cxc.total;
      cxc.estatus     = "cobrada";
    } else {
      cxc.estatus = "parcial";
    }

    await cxc.save();

    try {
      await enviarEmailCobro({
        cliente:     cxc.nombreReceptor ?? "—",
        folio:       cxc.folioFactura ?? cxc.uuid?.slice(0, 8) ?? "—",
        total:       monto,
        fechaPago:   fecha,
        complemento: complementoPago ?? null,
      });
    } catch (mailErr) {
      console.error("Error enviando email de cobro:", mailErr.message);
    }

    res.json(cxc);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// ── Cancelar factura ──
export async function cancelarCxc(req, res) {
  try {
    const cxc = await CuentaCobrar.findByIdAndUpdate(
      req.params.id,
      { estatus: "cancelada" },
      { new: true }
    );
    if (!cxc) return res.status(404).json({ message: "Cuenta por cobrar no encontrada" });
    res.json(cxc);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function cobrarPorRep(req, res) {
  try {
    const { pagos, fechaPago, complementoPago } = req.body;
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

      if (cxc.estatus === "cancelada") {
        resultados.push({ uuid: pago.uuid, encontrada: true, yaEstaba: true, folioFactura: cxc.folioFactura, nombreReceptor: cxc.nombreReceptor });
        continue;
      }

      const fecha = fechaPago ? new Date(fechaPago) : new Date();
      const monto = pago.montoPagado ?? cxc.total;

      cxc.pagos.push({
        monto,
        fechaPago: fecha,
        complementoPago: complementoPago ?? null,
        comentarios: "",
      });

      cxc.montoPagado     = (cxc.montoPagado ?? 0) + monto;
      cxc.fechaPago       = fecha;
      cxc.complementoPago = complementoPago ?? null;

      if (cxc.montoPagado >= cxc.total) {
        cxc.montoPagado = cxc.total;
        cxc.estatus     = "cobrada";
      } else {
        cxc.estatus = "parcial";
      }

      await cxc.save();

      try {
        await enviarEmailCobro({
          cliente:     cxc.nombreReceptor ?? "—",
          folio:       cxc.folioFactura ?? cxc.uuid?.slice(0, 8) ?? "—",
          total:       monto,
          fechaPago:   fecha,
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

export async function cobrarMultiple(req, res) {
  try {
    const { ids, fechaPago, complementoPago, comentarios } = req.body;
    if (!ids?.length) return res.status(400).json({ message: "Sin IDs para procesar" });

    const fecha = fechaPago ? new Date(fechaPago) : new Date();
    const resultados = [];
    const facturasEmail = [];
    let clienteNombre = "—";

    for (const id of ids) {
      const cxc = await CuentaCobrar.findById(id);
      if (!cxc) { resultados.push({ id, ok: false, razon: "No encontrada" }); continue; }
      if (cxc.estatus === "cobrada") {
        resultados.push({ id, ok: false, razon: "Ya estaba cobrada", folioFactura: cxc.folioFactura, nombreReceptor: cxc.nombreReceptor });
        continue;
      }
      if (cxc.estatus === "cancelada") {
        resultados.push({ id, ok: false, razon: "Cancelada", folioFactura: cxc.folioFactura, nombreReceptor: cxc.nombreReceptor });
        continue;
      }

      const monto = cxc.total - (cxc.montoPagado ?? 0);

      cxc.pagos.push({
        monto,
        fechaPago: fecha,
        complementoPago: complementoPago ?? null,
        comentarios: comentarios ?? "",
      });

      cxc.montoPagado     = cxc.total;
      cxc.estatus         = "cobrada";
      cxc.fechaPago       = fecha;
      cxc.complementoPago = complementoPago ?? null;
      cxc.comentarios     = comentarios ?? "";
      await cxc.save();

      clienteNombre = cxc.nombreReceptor ?? "—";
      facturasEmail.push({
        folio: cxc.folioFactura ?? cxc.uuid?.slice(0, 8) ?? "—",
        total: cxc.total,
      });

      resultados.push({
        id,
        ok: true,
        folioFactura: cxc.folioFactura,
        nombreReceptor: cxc.nombreReceptor,
        total: cxc.total,
      });
    }

    if (facturasEmail.length > 0) {
      try {
        await enviarEmailCobroMultiple({
          cliente:      clienteNombre,
          facturas:     facturasEmail,
          totalGeneral: facturasEmail.reduce((s, f) => s + Number(f.total), 0),
          fechaPago:    fecha,
        });
      } catch (mailErr) {
        console.error("Error enviando email cobro múltiple:", mailErr.message);
      }
    }

    res.json({ resultados });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}