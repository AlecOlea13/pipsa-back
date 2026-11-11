/**
 * comisionVenta.routes.js  →  src/routes/comisionVenta.routes.js
 *
 * app.js:
 *   import comisionVentaRoutes from "./routes/comisionVenta.routes.js";
 *   app.use("/api/comisiones", comisionVentaRoutes);
 *
 * Acceso: developer, gerencia y oficina.
 *  - oficina (vendedores): solo ven/capturan/editan/borran lo de SU asesor (se liga
 *    el usuario con el asesor por campo asesor/asesorId o por nombre idéntico).
 *  - developer y gerencia: ven todo, filtran por asesor y pueden editar/borrar.
 */
import { Router } from "express";
import mongoose from "mongoose";
import { auth, requireRol } from "../middleware/auth.js";
import ComisionVenta from "../models/ComisionVenta.js";
import Montacargas from "../models/Montacargas.js";
import Renta from "../models/Renta.js";
import Cotizacion from "../models/Cotizacion.js";
import CuentaCobrar from "../models/CuentaCobrar.js";

const router = Router();
const acceso = requireRol("developer", "gerencia", "oficina");
const esAdmin = (req) => ["developer", "gerencia"].includes(req.userRol);

/** ¿Puede este usuario tocar esta línea? (admin, o es suya por asesor/creador) */
async function esMia(req, linea) {
  if (esAdmin(req)) return true;
  if (String(linea.creadoPor) === String(req.userId)) return true;
  const yo = await miAsesor(req);
  return !!yo && String(linea.asesor) === String(yo._id);
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const TASA_IVA = 0.16;

const TIPOS = ["equipo", "renta", "refacciones", "servicio", "otro"];
const POPULATE = [{ path: "asesor", select: "nombre" }];

// ── Asesor ligado al usuario en sesión ─────────────────────────────────────
// Se busca primero un campo asesor/asesorId en el usuario; si no existe, se
// empareja por NOMBRE (sin acentos ni mayúsculas) contra la colección Asesor.
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

async function miAsesor(req) {
  try {
    const User = mongoose.models.User ?? mongoose.models.Usuario;
    const Asesor = mongoose.models.Asesor;
    if (!User || !Asesor) return null;
    const u = await User.findById(req.userId).lean();
    if (!u) return null;
    const directo = u.asesor ?? u.asesorId;
    if (directo && mongoose.isValidObjectId(directo)) {
      const a = await Asesor.findById(directo).select("nombre").lean();
      if (a) return a;
    }
    const nombre = norm(u.nombre ?? u.name);
    if (!nombre) return null;
    const todos = await Asesor.find().select("nombre").lean();
    return todos.find((a) => norm(a.nombre) === nombre) ?? null;
  } catch (e) {
    console.error("[comisiones/miAsesor]", e);
    return null;
  }
}

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
    factura:     String(b.factura ?? "").trim(),
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

// ── GET /mi-asesor ─────────────────────────────────────────────────────────
router.get("/mi-asesor", auth, acceso, async (req, res) => {
  if (esAdmin(req)) return res.json({ admin: true, asesor: null });
  const a = await miAsesor(req);
  res.json({ admin: false, asesor: a ? { _id: a._id, nombre: a.nombre } : null });
});

// ── GET /origenes?tipo=equipo|renta|refacciones|servicio&buscar=&asesorId= ──
// Lista de ventas seleccionables para precargar la línea.
router.get("/origenes", auth, acceso, async (req, res) => {
  try {
    const { tipo, buscar = "" } = req.query;
    let { asesorId } = req.query;
    const q = String(buscar).trim().toLowerCase();
    // Vendedor (oficina): SOLO sus propias ventas. Sin asesor ligado → nada.
    if (!esAdmin(req)) {
      const yo = await miAsesor(req);
      if (!yo) return res.json([]);
      asesorId = String(yo._id);
    }
    const asesorOk = asesorId && mongoose.isValidObjectId(asesorId);
    let items = [];

    if (tipo === "equipo") {
      const filtro = { "venta.fecha": { $ne: null } };
      if (asesorOk) filtro["venta.asesor"] = asesorId;
      const docs = await Montacargas.find(filtro)
        .select("numeroEconomico marca modelo venta")
        .populate("venta.asesor", "nombre")
        .populate("venta.cliente", "nombre")
        .populate("venta.permuta.equipoRecibido", "numeroEconomico marca modelo")
        .sort({ "venta.fecha": -1 }).limit(500).lean();
      items = docs.map((m) => {
        const pe = m.venta?.permuta;
        const recibido = pe?.activa
          ? (pe.equipoRecibido?.numeroEconomico
              ? `${pe.equipoRecibido.numeroEconomico} ${pe.equipoRecibido.marca ?? ""} ${pe.equipoRecibido.modelo ?? ""}`.trim()
              : (pe.equipoRecibidoTexto || "equipo recibido"))
          : "";
        return { m, recibido, forma: pe?.diferenciaForma ?? "" };
      }).map(({ m, recibido, forma }) => ({
        origenRef: "Montacargas", origenId: m._id,
        referencia: m.numeroEconomico ?? "",
        factura: m.venta?.numeroFactura ?? "",
        descripcion: [[m.marca, m.modelo].filter(Boolean).join(" "),
          recibido ? `Permuta: recibió ${recibido}${forma ? ` · diferencia ${forma}` : ""}` : ""].filter(Boolean).join(" · "),
        cliente: m.venta?.cliente?.nombre ?? m.venta?.clienteNombre ?? "",
        asesor: m.venta?.asesor?._id ?? null, asesorNombre: m.venta?.asesor?.nombre ?? "",
        fechaVenta: m.venta?.fecha ?? null, fechaPago: m.venta?.fechaPago ?? null,
        moneda: "MXN",
        // Equipos: facturado sin IVA + efectivo (en permuta = la diferencia de dinero)
        subtotal: round2(num(m.venta?.montoFacturado) + num(m.venta?.montoEfectivo)),
      }));
    } else if (tipo === "renta") {
      const filtro = { estatus: "activa" };
      if (asesorOk) filtro.asesor = asesorId;
      const docs = await Renta.find(filtro)
        .populate("cliente", "nombre").populate("asesor", "nombre")
        .populate("montacargas", "numeroEconomico marca modelo")
        .sort({ createdAt: -1 }).limit(300).lean();
      // Factura: la de la cuenta por cobrar más reciente ligada a la renta
      const cxcs = await CuentaCobrar.find({ rentaId: { $in: docs.map((d) => d._id) } })
        .select("rentaId folioFactura createdAt").sort({ createdAt: -1 }).lean();
      const facturaDeRenta = {};
      for (const x of cxcs) { const k = String(x.rentaId); if (!facturaDeRenta[k] && x.folioFactura) facturaDeRenta[k] = x.folioFactura; }
      items = docs.map((r) => ({
        factura: facturaDeRenta[String(r._id)] ?? "",
        origenRef: "Renta", origenId: r._id,
        referencia: r.montacargas?.numeroEconomico ?? "",
        descripcion: [r.montacargas?.marca, r.montacargas?.modelo].filter(Boolean).join(" ") + " (renta mensual)",
        cliente: r.cliente?.nombre ?? "",
        asesor: r.asesor?._id ?? null, asesorNombre: r.asesor?.nombre ?? "",
        fechaVenta: r.fechaInicio ?? null, fechaPago: null,
        moneda: "MXN", subtotal: round2(r.precioMensual), // ya es sin IVA
      }));
    } else if (tipo === "refacciones" || tipo === "servicio") {
      // Solo cotizaciones FACTURADAS de ese tipo (las activas aún no son venta).
      const filtro = { tipo, estatus: "facturada" };
      if (asesorOk) filtro.asesor = asesorId;
      const docs = await Cotizacion.find(filtro)
        .select("folio cliente clienteOcasional asesor fecha fechaFacturada fechaPago subtotal total moneda numeroFactura")
        .populate("cliente", "nombre").populate("asesor", "nombre")
        .sort({ fechaFacturada: -1, fecha: -1 }).limit(1000).lean();
      items = docs.map((c) => ({
        origenRef: "Cotizacion", origenId: c._id,
        referencia: c.folio ?? "", descripcion: "", factura: c.numeroFactura ?? "",
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
        `${i.referencia} ${i.factura ?? ""} ${i.descripcion} ${i.cliente} ${i.asesorNombre}`.toLowerCase().includes(q));
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
    if (!esAdmin(req)) {
      const yo = await miAsesor(req);
      if (yo) filtro.asesor = yo._id;          // todo lo de MI asesor
      else filtro.creadoPor = req.userId;      // sin asesor ligado: solo lo que yo capturé
    } else if (asesorId && mongoose.isValidObjectId(asesorId)) {
      filtro.asesor = asesorId;
    }

    const lineas = await ComisionVenta.find(filtro).populate(POPULATE).sort({ periodo: -1, createdAt: -1 }).lean();

    // Líneas guardadas sin factura (capturadas antes de que existiera el campo):
    // se completa SOLO AL MOSTRAR desde la venta de origen. Lo guardado no cambia.
    const sinFactura = lineas.filter((l) => !l.factura && l.origenId);
    if (sinFactura.length) {
      const ids = (ref) => sinFactura.filter((l) => l.origenRef === ref).map((l) => l.origenId);
      const [cots, montas, cxcs] = await Promise.all([
        Cotizacion.find({ _id: { $in: ids("Cotizacion") } }).select("numeroFactura").lean(),
        Montacargas.find({ _id: { $in: ids("Montacargas") } }).select("venta.numeroFactura").lean(),
        CuentaCobrar.find({ rentaId: { $in: ids("Renta") } }).select("rentaId folioFactura createdAt").sort({ createdAt: -1 }).lean(),
      ]);
      const mapa = {};
      for (const c of cots)   if (c.numeroFactura) mapa[String(c._id)] = c.numeroFactura;
      for (const m of montas) if (m.venta?.numeroFactura) mapa[String(m._id)] = m.venta.numeroFactura;
      for (const x of cxcs)   if (x.folioFactura && !mapa[String(x.rentaId)]) mapa[String(x.rentaId)] = x.folioFactura;
      for (const l of sinFactura) l.factura = mapa[String(l.origenId)] ?? "";
    }

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
    if (!esAdmin(req)) {
      const yo = await miAsesor(req);
      if (!yo) return res.status(403).json({ message: "Tu usuario no está ligado a un asesor. Pide que lo den de alta con tu mismo nombre." });
      data.asesor = yo._id;                    // el vendedor solo captura a su nombre
    }
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
    if (!(await esMia(req, actual)))
      return res.status(403).json({ message: "Solo puedes editar tus propias comisiones." });

    const data = limpiarBody({ ...actual.toObject(), ...req.body });
    if (!esAdmin(req)) data.asesor = actual.asesor;   // un vendedor no puede reasignar a otro asesor
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
    if (!(await esMia(req, actual)))
      return res.status(403).json({ message: "Solo puedes borrar tus propias comisiones." });
    await actual.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    console.error("[comisiones/delete]", e);
    res.status(500).json({ message: "Error al borrar.", detalle: e.message });
  }
});

export default router;