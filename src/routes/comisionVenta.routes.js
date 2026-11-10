/**
 * comisionVenta.routes.js  →  src/routes/comisionVenta.routes.js
 *
 * app.js:
 *   import comisionVentaRoutes from "./routes/comisionVenta.routes.js";
 *   app.use("/api/comisiones", comisionVentaRoutes);
 *
 * Acceso: developer, gerencia y oficina.
 *  - oficina (vendedores): solo ven/editan/borran LO QUE ELLOS CAPTURARON.
 *  - developer y gerencia: ven todo, filtran por asesor y pueden editar/borrar.
 */
import { Router } from "express";
import mongoose from "mongoose";
import { auth, requireRol } from "../middleware/auth.js";
import ComisionVenta from "../models/ComisionVenta.js";
import Montacargas from "../models/Montacargas.js";
import Renta from "../models/Renta.js";
import Cotizacion from "../models/Cotizacion.js";

const router = Router();
const acceso = requireRol("developer", "gerencia", "oficina");
const esAdmin = (req) => ["developer", "gerencia"].includes(req.userRol);

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const TASA_IVA = 0.16;

const TIPOS = ["equipo", "renta", "refacciones", "servicio", "otro"];
const POPULATE = [
  { path: "asesor",    select: "nombre" },
  { path: "creadoPor", select: "nombre" },
];

const periodoValido = (p) => typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
const fechaOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

/** Toma solo los campos permitidos del body y los normaliza. */
function limpiarBody(b) {
  const out = {
    tipo:        b.tipo,
    origenRef:   b.origenRef || null,
    origenId:    b.origenId && mongoose.isValidObjectId(b.origenId) ? b.origenId : null,
    referencia:  String(b.referencia ?? "").trim(),
    descripcion: String(b.descripcion ?? "").trim(),
    cliente:     String(b.cliente ?? "").trim(),
    asesor:      b.asesor?._id ?? b.asesor,
    fechaVenta:  fechaOrNull(b.fechaVenta),
    fechaPago:   fechaOrNull(b.fechaPago),
    periodo:     b.periodo,
    moneda:      b.moneda === "USD" ? "USD" : "MXN",
    subtotal:    round2(b.subtotal),
    tipoCambio:  num(b.tipoCambio) > 0 ? num(b.tipoCambio) : 1,
    dias:        Math.max(0, Math.round(num(b.dias))),
    porcentaje:  Math.max(0, num(b.porcentaje)),
    comision:    round2(b.comision),
    notas:       String(b.notas ?? "").trim(),
  };
  return out;
}

function validar(d) {
  if (!TIPOS.includes(d.tipo)) return "Tipo inválido.";
  if (!d.asesor || !mongoose.isValidObjectId(d.asesor)) return "Selecciona el asesor.";
  if (!periodoValido(d.periodo)) return "Periodo inválido (usa AAAA-MM).";
  if (d.comision < 0) return "La comisión no puede ser negativa.";
  return null;
}

// ── GET /origenes?tipo=equipo|renta|refacciones|servicio&buscar=&asesorId= ──
// Lista de ventas seleccionables para precargar la línea.
router.get("/origenes", auth, acceso, async (req, res) => {
  try {
    const { tipo, buscar = "", asesorId } = req.query;
    const q = String(buscar).trim().toLowerCase();
    const asesorOk = asesorId && mongoose.isValidObjectId(asesorId);
    let items = [];

    if (tipo === "equipo") {
      const filtro = { "venta.fecha": { $ne: null } };
      if (asesorOk) filtro["venta.asesor"] = asesorId;
      const docs = await Montacargas.find(filtro)
        .select("numeroEconomico marca modelo venta")
        .populate("venta.asesor", "nombre")
        .sort({ "venta.fecha": -1 }).limit(300).lean();
      items = docs.map((m) => ({
        origenRef: "Montacargas", origenId: m._id,
        referencia: m.numeroEconomico ?? "",
        descripcion: [m.marca, m.modelo].filter(Boolean).join(" "),
        cliente: m.venta?.clienteNombre ?? "",
        asesor: m.venta?.asesor?._id ?? null, asesorNombre: m.venta?.asesor?.nombre ?? "",
        fechaVenta: m.venta?.fecha ?? null, fechaPago: m.venta?.fechaPago ?? null,
        moneda: "MXN",
        // Equipos: facturado sin IVA + efectivo
        subtotal: round2(num(m.venta?.montoFacturado) + num(m.venta?.montoEfectivo)),
      }));
    } else if (tipo === "renta") {
      const filtro = { estatus: "activa" };
      if (asesorOk) filtro.asesor = asesorId;
      const docs = await Renta.find(filtro)
        .populate("cliente", "nombre").populate("asesor", "nombre")
        .populate("montacargas", "numeroEconomico marca modelo")
        .sort({ createdAt: -1 }).limit(300).lean();
      items = docs.map((r) => ({
        origenRef: "Renta", origenId: r._id,
        referencia: r.montacargas?.numeroEconomico ?? "",
        descripcion: [r.montacargas?.marca, r.montacargas?.modelo].filter(Boolean).join(" ") + " (renta mensual)",
        cliente: r.cliente?.nombre ?? "",
        asesor: r.asesor?._id ?? null, asesorNombre: r.asesor?.nombre ?? "",
        fechaVenta: r.fechaInicio ?? null, fechaPago: null,
        moneda: "MXN", subtotal: round2(r.precioMensual), // ya es sin IVA
      }));
    } else if (tipo === "refacciones" || tipo === "servicio") {
      const filtro = { tipo, estatus: { $ne: "cancelada" } };
      if (asesorOk) filtro.asesor = asesorId;
      const docs = await Cotizacion.find(filtro)
        .select("folio cliente clienteOcasional asesor fecha fechaFacturada fechaPago subtotal total moneda numeroFactura")
        .populate("cliente", "nombre").populate("asesor", "nombre")
        .sort({ fecha: -1 }).limit(300).lean();
      items = docs.map((c) => ({
        origenRef: "Cotizacion", origenId: c._id,
        referencia: c.folio ?? "", descripcion: c.numeroFactura ? `Factura ${c.numeroFactura}` : "",
        cliente: c.cliente?.nombre ?? c.clienteOcasional?.nombre ?? "",
        asesor: c.asesor?._id ?? null, asesorNombre: c.asesor?.nombre ?? "",
        fechaVenta: c.fechaFacturada ?? c.fecha ?? null, fechaPago: c.fechaPago ?? null,
        moneda: c.moneda ?? "MXN",
        subtotal: round2(num(c.subtotal) > 0 ? c.subtotal : num(c.total) / (1 + TASA_IVA)),
      }));
    } else {
      return res.status(400).json({ message: "tipo debe ser equipo, renta, refacciones o servicio." });
    }

    if (q) {
      items = items.filter((i) =>
        `${i.referencia} ${i.descripcion} ${i.cliente} ${i.asesorNombre}`.toLowerCase().includes(q));
    }
    res.json(items.slice(0, 100));
  } catch (e) {
    console.error("[comisiones/origenes]", e);
    res.status(500).json({ message: "Error al cargar las ventas.", detalle: e.message });
  }
});

// ── GET /?periodo=AAAA-MM&asesorId=&tipo= ──────────────────────────────────
// oficina: solo lo suyo. developer/gerencia: todo (filtrable).
router.get("/", auth, acceso, async (req, res) => {
  try {
    const { periodo, asesorId, tipo } = req.query;
    const filtro = {};
    if (periodo) {
      if (!periodoValido(periodo)) return res.status(400).json({ message: "Periodo inválido (AAAA-MM)." });
      filtro.periodo = periodo;
    }
    if (tipo && TIPOS.includes(tipo)) filtro.tipo = tipo;
    if (!esAdmin(req)) filtro.creadoPor = req.userId;
    if (asesorId && mongoose.isValidObjectId(asesorId)) filtro.asesor = asesorId;

    const lineas = await ComisionVenta.find(filtro).populate(POPULATE).sort({ periodo: -1, createdAt: -1 }).lean();

    // Resumen por asesor y por tipo
    const porAsesor = {}, porTipo = {};
    let total = 0;
    for (const l of lineas) {
      const nom = l.asesor?.nombre ?? "Sin asesor";
      porAsesor[nom] = round2((porAsesor[nom] ?? 0) + l.comision);
      porTipo[l.tipo] = round2((porTipo[l.tipo] ?? 0) + l.comision);
      total += l.comision;
    }
    res.json({
      lineas,
      resumen: {
        total: round2(total), cantidad: lineas.length,
        porAsesor: Object.entries(porAsesor).map(([asesor, comision]) => ({ asesor, comision }))
          .sort((a, b) => b.comision - a.comision),
        porTipo,
      },
    });
  } catch (e) {
    console.error("[comisiones/list]", e);
    res.status(500).json({ message: "Error al cargar comisiones.", detalle: e.message });
  }
});

// ── POST / ─────────────────────────────────────────────────────────────────
router.post("/", auth, acceso, async (req, res) => {
  try {
    const data = limpiarBody(req.body ?? {});
    const err = validar(data);
    if (err) return res.status(400).json({ message: err });
    const doc = await ComisionVenta.create({ ...data, creadoPor: req.userId });
    res.status(201).json(await doc.populate(POPULATE));
  } catch (e) {
    console.error("[comisiones/create]", e);
    res.status(500).json({ message: "Error al guardar.", detalle: e.message });
  }
});

// ── PUT /:id ───────────────────────────────────────────────────────────────
router.put("/:id", auth, acceso, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "ID inválido." });
    const actual = await ComisionVenta.findById(req.params.id);
    if (!actual) return res.status(404).json({ message: "No encontrada." });
    if (!esAdmin(req) && String(actual.creadoPor) !== String(req.userId))
      return res.status(403).json({ message: "Solo puedes editar tus propias comisiones." });

    const data = limpiarBody({ ...actual.toObject(), ...req.body });
    const err = validar(data);
    if (err) return res.status(400).json({ message: err });
    actual.set(data);
    await actual.save();
    res.json(await actual.populate(POPULATE));
  } catch (e) {
    console.error("[comisiones/update]", e);
    res.status(500).json({ message: "Error al actualizar.", detalle: e.message });
  }
});

// ── DELETE /:id ────────────────────────────────────────────────────────────
router.delete("/:id", auth, acceso, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "ID inválido." });
    const actual = await ComisionVenta.findById(req.params.id);
    if (!actual) return res.status(404).json({ message: "No encontrada." });
    if (!esAdmin(req) && String(actual.creadoPor) !== String(req.userId))
      return res.status(403).json({ message: "Solo puedes borrar tus propias comisiones." });
    await actual.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    console.error("[comisiones/delete]", e);
    res.status(500).json({ message: "Error al borrar.", detalle: e.message });
  }
});

export default router;