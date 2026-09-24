import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import {
  toMexDay, diffDays, calcFechaVencimiento,
  calcSaldo, calcRango, calcEstado, calcRiesgo, enriquecerFacturas,
} from "../utils/cartera.utils.js";

const router = Router();
const soloGerencia = requireRol("developer", "gerencia");

// ─────────────────────────────────────────────────────────────
// CORS explícito para este router (Vercel serverless)
// ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://last-to-do-u9vd.vercel.app",
  "http://localhost:5173",
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

// Preflight para todas las rutas de cartera
router.options("/(.*)", (req, res) => {
  setCors(req, res);
  res.sendStatus(204);
});

// Middleware que inyecta CORS en cada respuesta
router.use((req, res, next) => {
  setCors(req, res);
  next();
});

// ─────────────────────────────────────────────────────────────
// Helper: fecha de corte desde query o hoy (México)
// ─────────────────────────────────────────────────────────────
function getFechaCorte(query) {
  if (query.fechaCorte) {
    const d = toMexDay(query.fechaCorte);
    if (d) return d;
  }
  return toMexDay(new Date());
}

// ─────────────────────────────────────────────────────────────
// Helper: construir filtro Mongo desde query params
// ─────────────────────────────────────────────────────────────
function buildFiltro(query) {
  const filtro = { estatus: { $in: ["pendiente", "parcial"] } };

  if (query.cliente)   filtro.nombreReceptor = { $regex: query.cliente, $options: "i" };
  if (query.busqueda)  filtro.$or = [
    { nombreReceptor: { $regex: query.busqueda, $options: "i" } },
    { folioFactura:   { $regex: query.busqueda, $options: "i" } },
    { rfcReceptor:    { $regex: query.busqueda, $options: "i" } },
    { uuid:           { $regex: query.busqueda, $options: "i" } },
  ];
  if (query.emisionDesde || query.emisionHasta) {
    filtro.fechaEmision = {};
    if (query.emisionDesde) filtro.fechaEmision.$gte = new Date(query.emisionDesde);
    if (query.emisionHasta) filtro.fechaEmision.$lte = new Date(query.emisionHasta + "T23:59:59");
  }
  if (query.soloParcial === "true") filtro.estatus = "parcial";

  return filtro;
}

// ─────────────────────────────────────────────────────────────
// Helper: mapa RFC → diasCredito del modelo Cliente
// ─────────────────────────────────────────────────────────────
async function buildMapaClientes(CuentaCobrar, Cliente) {
  // Obtener RFCs únicos presentes en cartera
  const rfcs = await CuentaCobrar.distinct("rfcReceptor", {
    estatus: { $in: ["pendiente", "parcial"] },
  });
  const clientes = await Cliente.find({ rfc: { $in: rfcs } })
    .select("rfc diasCredito condicionesPago nombre");
  const mapa = {};
  for (const c of clientes) {
    mapa[c.rfc] = { diasCredito: c.diasCredito ?? null, nombre: c.nombre };
  }
  return mapa;
}

// ─────────────────────────────────────────────────────────────
// GET /api/cartera
// Resumen gerencial + tabla por cliente
// ─────────────────────────────────────────────────────────────
router.get("/", auth, soloGerencia, async (req, res) => {
  try {
    const { default: CuentaCobrar } = await import("../models/CuentaCobrar.js");
    const { default: Cliente }      = await import("../models/Cliente.js");

    const fechaCorte   = getFechaCorte(req.query);
    const filtroMongo  = buildFiltro(req.query);
    const mapaClientes = await buildMapaClientes(CuentaCobrar, Cliente);

    // Paginación
    const page  = Math.max(1, parseInt(req.query.page  ?? "1"));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? "50")));

    // Ordenamiento tabla
    const SORT_MAP = {
      saldo:        { saldoPendiente: -1 },
      saldoVencido: { saldoVencido:   -1 },
      diasVencidos: { maxDiasVencidos:-1 },
      antigüedad:   { fechaMasAntigua: 1 },
      nombre:       { _id: 1 },
      riesgo:       { nivelRiesgoNum: -1 },
    };
    const sortKey = req.query.sort ?? "saldo";
    const sortObj = SORT_MAP[sortKey] ?? { saldoPendiente: -1 };

    // ── Agregación principal: agrupar por cliente ──────────────────
    const docs = await CuentaCobrar.find(filtroMongo)
      .select("nombreReceptor rfcReceptor folioFactura uuid fechaEmision fechaVencimiento diasCredito total montoPagado estatus pagos fechaPago moneda notas")
      .lean();

    // Enriquecer en JS para aplicar lógica de vencimiento con plazo de cliente
    const enriched = docs.map(doc => {
      const diasCreditoCli = mapaClientes[doc.rfcReceptor]?.diasCredito ?? null;
      const [fact]         = enriquecerFacturas([doc], fechaCorte, diasCreditoCli);
      return fact;
    });

    // Filtros post-cálculo (no pueden ir en Mongo porque dependen de fechaVencimiento calculada)
    let filtradas = enriched;

    if (req.query.soloVencidas === "true")
      filtradas = filtradas.filter(f => f.diasVencidos > 0);
    if (req.query.sinFechaVencimiento === "true")
      filtradas = filtradas.filter(f => f.sinFechaVencimiento);
    if (req.query.estado)
      filtradas = filtradas.filter(f => f.estado === req.query.estado);
    if (req.query.rango)
      filtradas = filtradas.filter(f => f.rango === req.query.rango);
    if (req.query.saldoMin)
      filtradas = filtradas.filter(f => f.saldo >= parseFloat(req.query.saldoMin));
    if (req.query.saldoMax)
      filtradas = filtradas.filter(f => f.saldo <= parseFloat(req.query.saldoMax));
    if (req.query.vencimientoDesde)
      filtradas = filtradas.filter(f => f.fechaVencimiento && f.fechaVencimiento >= new Date(req.query.vencimientoDesde));
    if (req.query.vencimientoHasta)
      filtradas = filtradas.filter(f => f.fechaVencimiento && f.fechaVencimiento <= new Date(req.query.vencimientoHasta + "T23:59:59"));

    // ── Agrupar por cliente ────────────────────────────────────────
    const mapaAgrupado = {};
    for (const f of filtradas) {
      const key = f.nombreReceptor ?? f.rfcReceptor ?? "Sin nombre";
      if (!mapaAgrupado[key]) {
        mapaAgrupado[key] = {
          nombre:          key,
          rfc:             f.rfcReceptor,
          diasCreditoCli:  mapaClientes[f.rfcReceptor]?.diasCredito ?? null,
          facturas:        [],
        };
      }
      mapaAgrupado[key].facturas.push(f);
    }

    // ── Calcular totales por cliente ───────────────────────────────
    const RIESGO_NUM = { bajo: 0, medio: 1, alto: 2, critico: 3, por_definir: -1 };

    const clientes = Object.values(mapaAgrupado).map(c => {
      const fPend = c.facturas; // ya son solo pendientes/parciales
      const saldoTotal    = fPend.reduce((a, f) => a + f.saldo, 0);
      const saldoVencido  = fPend.filter(f => f.diasVencidos > 0).reduce((a, f) => a + f.saldo, 0);
      const saldoVigente  = fPend.filter(f => f.diasVencidos <= 0 && !f.sinFechaVencimiento).reduce((a, f) => a + f.saldo, 0);
      const saldoSinDef   = fPend.filter(f => f.sinFechaVencimiento).reduce((a, f) => a + f.saldo, 0);
      const maxDias       = fPend.reduce((a, f) => Math.max(a, f.diasVencidos), 0);
      const tieneSinFecha = fPend.some(f => f.sinFechaVencimiento && f.diasVencidos === 0);
      const riesgo        = calcRiesgo(maxDias, tieneSinFecha && maxDias === 0);
      const fechaMasAntigua = fPend.reduce((a, f) => {
        if (!f.fechaEmision) return a;
        return !a || f.fechaEmision < a ? f.fechaEmision : a;
      }, null);
      const ultimoPago = fPend.reduce((a, f) => {
        if (!f.ultimoPago) return a;
        return !a || f.ultimoPago > a ? f.ultimoPago : a;
      }, null);
      const ultimaEmision = fPend.reduce((a, f) => {
        if (!f.fechaEmision) return a;
        return !a || f.fechaEmision > a ? f.fechaEmision : a;
      }, null);

      return {
        nombre:          c.nombre,
        rfc:             c.rfc,
        diasCreditoCli:  c.diasCreditoCli,
        facturasPend:    fPend.length,
        saldoVigente,
        saldoVencido,
        saldoSinDef,
        saldoTotal,
        fechaMasAntigua,
        maxDiasVencidos: maxDias,
        ultimoPago,
        ultimaEmision,
        riesgo,
        nivelRiesgoNum:  RIESGO_NUM[riesgo] ?? 0,
        saldoPendiente:  saldoTotal, // alias para sort
      };
    });

    // Ordenar clientes
    const sortClientes = (a, b) => {
      const [campo, dir] = Object.entries(sortObj)[0];
      const va = a[campo] ?? 0;
      const vb = b[campo] ?? 0;
      if (typeof va === "string") return dir === 1 ? va.localeCompare(vb) : vb.localeCompare(va);
      return dir === 1 ? va - vb : vb - va;
    };
    clientes.sort(sortClientes);

    // Paginación
    const total     = clientes.length;
    const paginated = clientes.slice((page - 1) * limit, page * limit);

    // ── Resumen global ─────────────────────────────────────────────
    const cartTotal  = filtradas.reduce((a, f) => a + f.saldo, 0);
    const cartVenc   = filtradas.filter(f => f.diasVencidos > 0).reduce((a, f) => a + f.saldo, 0);
    const cartVig    = filtradas.filter(f => f.diasVencidos <= 0 && !f.sinFechaVencimiento).reduce((a, f) => a + f.saldo, 0);
    const cartSinDef = filtradas.filter(f => f.sinFechaVencimiento).reduce((a, f) => a + f.saldo, 0);
    const factsVenc  = filtradas.filter(f => f.diasVencidos > 0);
    const sumDV      = factsVenc.reduce((a, f) => a + f.diasVencidos * f.saldo, 0);
    const promPond   = cartVenc > 0 ? sumDV / cartVenc : 0;

    const clisConVenc = new Set(filtradas.filter(f => f.diasVencidos > 0).map(f => f.nombreReceptor)).size;

    // Rangos
    const rangos = { vigente: 0, "1_30": 0, "31_60": 0, "61_90": 0, mas_90: 0, sin_definir: 0 };
    for (const f of filtradas) rangos[f.rango] = (rangos[f.rango] ?? 0) + f.saldo;

    res.json({
      fechaCorte: fechaCorte.toISOString().split("T")[0],
      resumen: {
        carteraTotal:     cartTotal,
        carteraVigente:   cartVig,
        carteraVencida:   cartVenc,
        carteraSinDefinir: cartSinDef,
        pctVencida:       cartTotal > 0 ? (cartVenc / cartTotal) * 100 : 0,
        clientesPend:     Object.keys(mapaAgrupado).length,
        clientesVencidos: clisConVenc,
        facturasPend:     filtradas.length,
        facturasVencidas: factsVenc.length,
        facturasSinFecha: filtradas.filter(f => f.sinFechaVencimiento).length,
        promPondDiasVencidos: promPond,
        saldoMas90:       rangos["mas_90"],
      },
      rangos,
      clientes: paginated,
      paginacion: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("Error GET /api/cartera:", e);
    res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/cartera/cliente/:nombre
// Detalle de facturas de un cliente
// ─────────────────────────────────────────────────────────────
router.get("/cliente/:nombre", auth, soloGerencia, async (req, res) => {
  try {
    const { default: CuentaCobrar } = await import("../models/CuentaCobrar.js");
    const { default: Cliente }      = await import("../models/Cliente.js");

    const fechaCorte = getFechaCorte(req.query);
    const nombre     = decodeURIComponent(req.params.nombre);

    const docs = await CuentaCobrar.find({
      nombreReceptor: { $regex: `^${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
      estatus: { $in: ["pendiente", "parcial"] },
    }).lean();

    if (!docs.length) return res.json({ cliente: nombre, facturas: [], resumen: null });

    // Buscar cliente por RFC
    const rfc          = docs[0].rfcReceptor;
    const clienteDoc   = rfc ? await Cliente.findOne({ rfc }).lean() : null;
    const diasCredCli  = clienteDoc?.diasCredito ?? null;

    const facturas = enriquecerFacturas(docs, fechaCorte, diasCredCli);

    // Ordenar
    const sortFacturas = req.query.sort ?? "fechaEmision";
    const SORT_F = {
      saldo:           (a, b) => b.saldo - a.saldo,
      fechaEmision:    (a, b) => (b.fechaEmision ?? 0) - (a.fechaEmision ?? 0),
      fechaVencimiento:(a, b) => (a.fechaVencimiento ?? Infinity) - (b.fechaVencimiento ?? Infinity),
      diasVencidos:    (a, b) => b.diasVencidos - a.diasVencidos,
    };
    facturas.sort(SORT_F[sortFacturas] ?? SORT_F.fechaEmision);

    const saldoTotal   = facturas.reduce((a, f) => a + f.saldo, 0);
    const saldoVencido = facturas.filter(f => f.diasVencidos > 0).reduce((a, f) => a + f.saldo, 0);
    const saldoVigente = facturas.filter(f => f.diasVencidos <= 0 && !f.sinFechaVencimiento).reduce((a, f) => a + f.saldo, 0);
    const maxDias      = facturas.reduce((a, f) => Math.max(a, f.diasVencidos), 0);
    const ultimoPago   = facturas.reduce((a, f) => (!f.ultimoPago || (a && a > f.ultimoPago)) ? a : f.ultimoPago, null);

    res.json({
      cliente: {
        nombre,
        rfc,
        diasCreditoCli:  diasCredCli,
        condicionesPago: clienteDoc?.condicionesPago ?? null,
        contacto:        clienteDoc?.contacto ?? null,
        email:           clienteDoc?.email ?? null,
      },
      resumen: {
        saldoTotal, saldoVencido, saldoVigente,
        facturasPend: facturas.length,
        maxDiasVencidos: maxDias,
        ultimoPago,
      },
      facturas,
    });
  } catch (e) {
    console.error("Error GET /api/cartera/cliente:", e);
    res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/cartera/exportar/csv
// ─────────────────────────────────────────────────────────────
router.get("/exportar/csv", auth, soloGerencia, async (req, res) => {
  try {
    const { default: CuentaCobrar } = await import("../models/CuentaCobrar.js");
    const { default: Cliente }      = await import("../models/Cliente.js");

    const fechaCorte   = getFechaCorte(req.query);
    const filtroMongo  = buildFiltro(req.query);
    const mapaClientes = await buildMapaClientes(CuentaCobrar, Cliente);

    const docs = await CuentaCobrar.find(filtroMongo)
      .select("nombreReceptor rfcReceptor folioFactura uuid fechaEmision fechaVencimiento diasCredito total montoPagado estatus pagos fechaPago moneda")
      .lean();

    let rows = docs.map(doc => {
      const diasCredCli = mapaClientes[doc.rfcReceptor]?.diasCredito ?? null;
      const [f] = enriquecerFacturas([doc], fechaCorte, diasCredCli);
      return f;
    });

    // Filtros post-calc igual que en GET /
    if (req.query.soloVencidas === "true")      rows = rows.filter(f => f.diasVencidos > 0);
    if (req.query.sinFechaVencimiento === "true") rows = rows.filter(f => f.sinFechaVencimiento);
    if (req.query.estado)  rows = rows.filter(f => f.estado === req.query.estado);
    if (req.query.rango)   rows = rows.filter(f => f.rango  === req.query.rango);
    if (req.query.saldoMin) rows = rows.filter(f => f.saldo >= parseFloat(req.query.saldoMin));
    if (req.query.saldoMax) rows = rows.filter(f => f.saldo <= parseFloat(req.query.saldoMax));

    const fmtDate = d => d ? new Date(d).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" }) : "";
    const fmtNum  = n => typeof n === "number" ? n.toFixed(2) : "";

    const cabecera = [
      "Cliente","RFC","Folio","UUID","Emisión","Vencimiento","Plazo (días)",
      "Total original","Pagos aplicados","Saldo pendiente",
      "Días transcurridos","Días vencidos","Rango","Estado","Último pago",
    ].join(",");

    const lineas = rows.map(f => [
      `"${(f.nombreReceptor ?? "").replace(/"/g, '""')}"`,
      f.rfcReceptor ?? "",
      f.folioFactura ?? "",
      f.uuid ?? "",
      fmtDate(f.fechaEmision),
      fmtDate(f.fechaVencimiento),
      f.diasCredito ?? "",
      fmtNum(f.total),
      fmtNum(f.montoPagado),
      fmtNum(f.saldo),
      f.diasTranscurridos,
      f.diasVencidos,
      f.rango,
      f.estado,
      fmtDate(f.ultimoPago),
    ].join(","));

    const fecha  = fechaCorte.toISOString().split("T")[0];
    const csv    = [cabecera, ...lineas].join("\n");
    const nombre = `reporte-cartera-pipsa-${fecha}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send("\uFEFF" + csv); // BOM para Excel en español
  } catch (e) {
    console.error("Error CSV cartera:", e);
    res.status(500).json({ message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/cartera/exportar/pdf-data
// Devuelve los datos estructurados para que el frontend
// genere el PDF ejecutivo con html-to-pdf o jsPDF existente
// ─────────────────────────────────────────────────────────────
router.get("/exportar/pdf-data", auth, soloGerencia, async (req, res) => {
  try {
    const { default: CuentaCobrar } = await import("../models/CuentaCobrar.js");
    const { default: Cliente }      = await import("../models/Cliente.js");

    const fechaCorte   = getFechaCorte(req.query);
    const filtroMongo  = buildFiltro(req.query);
    const mapaClientes = await buildMapaClientes(CuentaCobrar, Cliente);

    const docs = await CuentaCobrar.find(filtroMongo)
      .select("nombreReceptor rfcReceptor folioFactura uuid fechaEmision fechaVencimiento diasCredito total montoPagado estatus pagos fechaPago")
      .lean();

    let rows = docs.map(doc => {
      const diasCredCli = mapaClientes[doc.rfcReceptor]?.diasCredito ?? null;
      const [f] = enriquecerFacturas([doc], fechaCorte, diasCredCli);
      return f;
    });

    if (req.query.soloVencidas === "true") rows = rows.filter(f => f.diasVencidos > 0);
    if (req.query.estado) rows = rows.filter(f => f.estado === req.query.estado);
    if (req.query.rango)  rows = rows.filter(f => f.rango  === req.query.rango);

    // Top 10 deudores y top 10 vencidos
    const porCliente = {};
    for (const f of rows) {
      const k = f.nombreReceptor ?? "Sin nombre";
      if (!porCliente[k]) porCliente[k] = { nombre: k, saldoTotal: 0, saldoVencido: 0, maxDias: 0 };
      porCliente[k].saldoTotal   += f.saldo;
      porCliente[k].saldoVencido += f.diasVencidos > 0 ? f.saldo : 0;
      porCliente[k].maxDias       = Math.max(porCliente[k].maxDias, f.diasVencidos);
    }
    const topDeudores = Object.values(porCliente).sort((a, b) => b.saldoTotal - a.saldoTotal).slice(0, 10);
    const topVencidos = Object.values(porCliente).sort((a, b) => b.saldoVencido - a.saldoVencido).slice(0, 10);

    const cartTotal  = rows.reduce((a, f) => a + f.saldo, 0);
    const cartVenc   = rows.filter(f => f.diasVencidos > 0).reduce((a, f) => a + f.saldo, 0);
    const cartVig    = rows.filter(f => f.diasVencidos <= 0 && !f.sinFechaVencimiento).reduce((a, f) => a + f.saldo, 0);
    const rangos     = { vigente: 0, "1_30": 0, "31_60": 0, "61_90": 0, mas_90: 0, sin_definir: 0 };
    for (const f of rows) rangos[f.rango] = (rangos[f.rango] ?? 0) + f.saldo;

    res.json({
      fechaCorte:     fechaCorte.toISOString().split("T")[0],
      generadoEn:     new Date().toISOString(),
      generadoPor:    req.userNombre ?? req.userId ?? "—",
      resumen: { carteraTotal: cartTotal, carteraVigente: cartVig, carteraVencida: cartVenc },
      rangos,
      topDeudores,
      topVencidos,
      facturasVencidas: rows.filter(f => f.diasVencidos > 0).sort((a, b) => b.diasVencidos - a.diasVencidos).slice(0, 50),
    });
  } catch (e) {
    console.error("Error PDF data cartera:", e);
    res.status(500).json({ message: e.message });
  }
});

// Mantiene el endpoint viejo funcionando (retrocompatibilidad)
// El router de resumen.routes.js puede seguir apuntando a su propio /cartera
// o simplemente importar este router como /api/cartera

export default router;