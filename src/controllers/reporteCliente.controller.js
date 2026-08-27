// controllers/reporteCliente.controller.js
import ReporteCliente from "../models/ReporteCliente.js";
import Montacargas from "../models/Montacargas.js";
import { enviarEmailReporteCliente } from "../utils/mailer.js";

async function generarFolio() {
  const ultimo = await ReporteCliente.findOne().sort({ createdAt: -1 }).select("folio");
  if (!ultimo?.folio) return "RPT-001";
  const num = parseInt(ultimo.folio.split("-")[1] ?? "0") + 1;
  return `RPT-${String(num).padStart(3, "0")}`;
}

export async function getReportes(req, res) {
  try {
    const filtro = {};
    // Si es cliente solo ve los suyos
    if (req.userRol === "cliente") {
      const user = await (await import("../models/User.js")).default.findById(req.userId);
      if (!user?.clienteRef) return res.json([]);
      filtro.cliente = user.clienteRef;
    }
    const reportes = await ReporteCliente.find(filtro)
      .populate("cliente", "nombre")
      .populate("creadoPor", "nombre")
      .populate("montacargas", "numeroEconomico marca modelo")
      .sort({ createdAt: -1 });
    res.json(reportes);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function crearReporte(req, res) {
  try {
    const { descripcion, montacargasId, foto } = req.body;
    if (!descripcion?.trim()) return res.status(400).json({ message: "La descripción es requerida" });

    // Obtener clienteRef del usuario
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(req.userId);
    if (!user?.clienteRef) return res.status(400).json({ message: "Usuario sin cliente asignado" });

    // Verificar que el montacargas pertenece al cliente
    if (montacargasId) {
      const monta = await Montacargas.findById(montacargasId);
      if (!monta || String(monta.clienteActual) !== String(user.clienteRef)) {
        return res.status(400).json({ message: "Montacargas no válido para este cliente" });
      }
    }

    const folio = await generarFolio();
    const reporte = await ReporteCliente.create({
      folio,
      cliente:     user.clienteRef,
      creadoPor:   req.userId,
      montacargas: montacargasId ?? null,
      descripcion: descripcion.trim(),
      foto:        foto ?? null,
    });

    await reporte.populate([
      { path: "cliente",     select: "nombre" },
      { path: "creadoPor",   select: "nombre" },
      { path: "montacargas", select: "numeroEconomico marca modelo" },
    ]);

    // Notificación por email
    try {
      const destinatarios = [
        { nombre: "Administración", email: "admin@pipsamontacargas.com" },
        { nombre: "Supervisor",     email: "supervisor@pipsamontacargas.com" },
      ];
      await enviarEmailReporteCliente(destinatarios, reporte);
    } catch (mailErr) {
      console.error("Error enviando email de reporte:", mailErr.message);
    }

    res.status(201).json(reporte);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function actualizarEstatus(req, res) {
  try {
    const { estatus, notaInterna } = req.body;
    if (!["abierto", "en_proceso", "cerrado"].includes(estatus)) {
      return res.status(400).json({ message: "Estatus inválido" });
    }
    const reporte = await ReporteCliente.findByIdAndUpdate(
      req.params.id,
      { estatus, ...(notaInterna !== undefined ? { notaInterna } : {}) },
      { new: true }
    ).populate("cliente", "nombre").populate("montacargas", "numeroEconomico marca modelo");

    if (!reporte) return res.status(404).json({ message: "Reporte no encontrado" });
    res.json(reporte);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getMontacargasCliente(req, res) {
  try {
    const User = (await import("../models/User.js")).default;
    const user = await User.findById(req.userId);
    if (!user?.clienteRef) return res.json([]);
    const montas = await Montacargas.find({ clienteActual: user.clienteRef, estatus: { $ne: "vendido" } })
      .select("numeroEconomico marca modelo serie");
    res.json(montas);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}