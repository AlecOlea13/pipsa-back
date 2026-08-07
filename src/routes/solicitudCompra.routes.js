import { Router } from "express";
import { auth, requireRol } from "../middleware/auth.js";
import SolicitudCompra from "../models/SolicitudCompra.js";

const router = Router();

const puedeCrear   = requireRol("developer", "gerencia", "oficina", "almacen", "supervisor_almacen");
const puedeLiberar = requireRol("developer", "gerencia");

const POPULATE = [
  { path: "solicitadoPor", select: "nombre rol" },
  { path: "liberadaPor",   select: "nombre" },
  {
    path: "cotizacion",
    select: "folio tipo tipoPeriodo cliente clienteOcasional montacargas asesor total subtotal iva estatus items fecha lugar descripcionServicio condiciones notas equipoMarca equipoModelo equipoSerie numeroFactura",
    populate: [
      { path: "cliente",     select: "nombre direccion telefono contacto" },
      { path: "montacargas", select: "numeroEconomico marca modelo capacidad serie alturaColapsada alturaLevante horquillas desplazadorLateral tipoLlantas voltaje tipoBateria incluyeCargador equipoSeguridad" },
      { path: "asesor",      select: "nombre puesto telefono email" },
    ],
  },
];

router.get("/", auth, async (req, res) => {
  try {
    const rol          = req.userRol;
    const userId       = req.userId;
    const puedeVerTodo = ["developer", "gerencia"].includes(rol);
    const esOficina    = rol === "oficina";
    const esAlmacen    = ["almacen", "supervisor_almacen"].includes(rol);

    if (!puedeVerTodo && !esOficina && !esAlmacen) {
      return res.status(403).json({ message: "Sin acceso" });
    }

    let filtro = {};

    if (puedeVerTodo) {
      // Gerencia/developer ven todo
      filtro = {};
    } else if (esOficina) {
      // Oficina solo ve las suyas
      filtro = { solicitadoPor: userId };
    } else if (esAlmacen) {
      // Almacén ve liberadas y sin liberar, no canceladas
      filtro = { estatus: { $in: ["sin_liberar", "liberada"] } };
    }

    const solicitudes = await SolicitudCompra.find(filtro)
      .populate(POPULATE)
      .sort({ createdAt: -1 });

    res.json(solicitudes);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", auth, puedeCrear, async (req, res) => {
  try {
    const { items, notas, cotizacionId, moneda } = req.body;
    if (!items?.length) return res.status(400).json({ message: "Agrega al menos un artículo" });

    const sol = new SolicitudCompra({
      solicitadoPor: req.userId,
      items,
      notas:      notas || "",
      cotizacion: cotizacionId || null,
      moneda:     moneda || "MXN",
    });
    await sol.save();
    await sol.populate(POPULATE);
    res.status(201).json(sol);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/:id/liberar", auth, puedeLiberar, async (req, res) => {
  try {
    const sol = await SolicitudCompra.findById(req.params.id);
    if (!sol) return res.status(404).json({ message: "No encontrada" });
    if (sol.estatus === "liberada") return res.status(400).json({ message: "Ya está liberada" });
    sol.estatus         = "liberada";
    sol.liberadaPor     = req.userId;
    sol.fechaLiberacion = new Date();
    await sol.save();
    await sol.populate(POPULATE);
    res.json(sol);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/:id/cancelar", auth, puedeLiberar, async (req, res) => {
  try {
    const sol = await SolicitudCompra.findById(req.params.id);
    if (!sol) return res.status(404).json({ message: "No encontrada" });
    sol.estatus = "cancelada";
    await sol.save();
    await sol.populate(POPULATE);
    res.json(sol);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.delete("/:id", auth, requireRol("developer"), async (req, res) => {
  try {
    await SolicitudCompra.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

export default router;