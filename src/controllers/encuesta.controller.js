import crypto from "crypto";
import Encuesta from "../models/Encuesta.js";
import Servicio from "../models/Servicio.js";
import { enviarEmailEncuesta, enviarEmailNotificacionEncuesta } from "../utils/mailer.js";

const NOTIFICACION_DESTINO = { nombre: "Pipsa", email: "polea@jitservices.com" };

function generarToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function enviarEncuesta(req, res) {
  try {
    const { servicioId } = req.params;
    const { emailDestino } = req.body;

    const servicio = await Servicio.findById(servicioId)
      .populate("cliente", "nombre email")
      .populate("tecnicoAsignado", "nombre")
      .populate("montacargas", "numeroEconomico marca modelo");

    if (!servicio) return res.status(404).json({ message: "Servicio no encontrado" });
    if (servicio.estatus !== "cerrado") return res.status(400).json({ message: "Solo se puede enviar encuesta de servicios cerrados" });

    const encuestaExistente = await Encuesta.findOne({ servicio: servicioId });
    if (encuestaExistente) {
      return res.status(400).json({
        message: "Ya existe una encuesta para este servicio",
        encuestaId: encuestaExistente._id,
        estatus: encuestaExistente.estatus,
      });
    }

    const email = emailDestino || servicio.cliente?.email;
    if (!email) return res.status(400).json({ message: "El cliente no tiene correo registrado. Proporciona un emailDestino en el body." });

    const token = generarToken();
    const encuesta = await Encuesta.create({
      servicio: servicioId,
      cliente: servicio.cliente._id,
      tecnicoAsignado: servicio.tecnicoAsignado?._id,
      token,
      emailEnviado: email,
      fechaEnvio: new Date(),
      estatus: "pendiente",
    });

    const BASE_URL = process.env.FRONTEND_URL || "https://last-to-do-u9vd.vercel.app";
    const linkEncuesta = `${BASE_URL}/encuesta/${token}`;

    await enviarEmailEncuesta({ nombre: servicio.cliente.nombre, email }, servicio, linkEncuesta);

    res.status(201).json({
      message: "Encuesta enviada correctamente",
      encuestaId: encuesta._id,
      emailEnviado: email,
      link: linkEncuesta,
    });
  } catch (e) {
    console.error("Error al enviar encuesta:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getEncuestaPublica(req, res) {
  try {
    const encuesta = await Encuesta.findOne({ token: req.params.token })
      .populate("servicio", "folio fechaReporte problema")
      .populate("cliente", "nombre")
      .populate("tecnicoAsignado", "nombre");

    if (!encuesta) return res.status(404).json({ message: "Encuesta no encontrada" });
    if (encuesta.estatus === "respondida") return res.status(400).json({ message: "Esta encuesta ya fue respondida. ¡Gracias por tu tiempo!" });
    if (encuesta.estatus === "expirada") return res.status(400).json({ message: "Este link ha expirado." });

    res.json({
      folioServicio: encuesta.servicio?.folio,
      fechaServicio: encuesta.servicio?.fechaReporte,
      problema: encuesta.servicio?.problema,
      cliente: encuesta.cliente?.nombre,
      tecnico: encuesta.tecnicoAsignado?.nombre,
    });
  } catch (e) {
    console.error("Error al obtener encuesta pública:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function responderEncuesta(req, res) {
  try {
    const encuesta = await Encuesta.findOne({ token: req.params.token })
      .populate("servicio", "folio fechaReporte")
      .populate("cliente", "nombre");

    if (!encuesta) return res.status(404).json({ message: "Encuesta no encontrada" });
    if (encuesta.estatus !== "pendiente") return res.status(400).json({ message: "Esta encuesta ya no está disponible para responder" });

    const { p1_atencion, p2_tiempoAcordado, p3_satisfaccion, p4_comunicacion, p5_general, comentarios, recomendaria } = req.body;

    const errores = [];
    if (!p1_atencion || p1_atencion < 1 || p1_atencion > 5) errores.push("p1_atencion debe ser 1-5");
    if (!["si", "no", "parcialmente"].includes(p2_tiempoAcordado)) errores.push("p2_tiempoAcordado inválido");
    if (!p3_satisfaccion || p3_satisfaccion < 1 || p3_satisfaccion > 5) errores.push("p3_satisfaccion debe ser 1-5");
    if (!["si", "no", "parcialmente"].includes(p4_comunicacion)) errores.push("p4_comunicacion inválido");
    if (!p5_general || p5_general < 1 || p5_general > 5) errores.push("p5_general debe ser 1-5");
    if (recomendaria === undefined || recomendaria === null) errores.push("recomendaria es obligatorio");
    if (errores.length > 0) return res.status(400).json({ message: "Datos inválidos", errores });

    encuesta.p1_atencion       = Number(p1_atencion);
    encuesta.p2_tiempoAcordado = p2_tiempoAcordado;
    encuesta.p3_satisfaccion   = Number(p3_satisfaccion);
    encuesta.p4_comunicacion   = p4_comunicacion;
    encuesta.p5_general        = Number(p5_general);
    encuesta.comentarios       = comentarios?.trim() || "";
    encuesta.recomendaria      = Boolean(recomendaria);
    encuesta.estatus           = "respondida";
    encuesta.fechaRespuesta    = new Date();

    await encuesta.save();

    try {
      await enviarEmailNotificacionEncuesta(NOTIFICACION_DESTINO, encuesta);
    } catch (mailErr) {
      console.error("Error enviando notificación interna de encuesta:", mailErr.message);
    }

    res.json({ message: "¡Gracias por tu respuesta! Tu opinión es muy importante para nosotros." });
  } catch (e) {
    console.error("Error al responder encuesta:", e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getEncuestas(req, res) {
  try {
    const { estatus } = req.query;
    const filtro = {};
    if (estatus) filtro.estatus = estatus;

    const encuestas = await Encuesta.find(filtro)
      .populate("servicio", "folio fechaReporte problema")
      .populate("cliente", "nombre email")
      .populate("tecnicoAsignado", "nombre")
      .sort({ createdAt: -1 });

    res.json(encuestas);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getEncuesta(req, res) {
  try {
    const encuesta = await Encuesta.findById(req.params.id)
      .populate("servicio", "folio fechaReporte problema notasCierre")
      .populate("cliente", "nombre email telefono")
      .populate("tecnicoAsignado", "nombre");

    if (!encuesta) return res.status(404).json({ message: "Encuesta no encontrada" });
    res.json(encuesta);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getResumenEncuestas(req, res) {
  try {
    const total       = await Encuesta.countDocuments();
    const respondidas = await Encuesta.countDocuments({ estatus: "respondida" });
    const pendientes  = await Encuesta.countDocuments({ estatus: "pendiente" });

    const [promedios] = await Encuesta.aggregate([
      { $match: { estatus: "respondida" } },
      {
        $group: {
          _id: null,
          p1: { $avg: "$p1_atencion" },
          p3: { $avg: "$p3_satisfaccion" },
          p5: { $avg: "$p5_general" },
          recomendarian: { $sum: { $cond: ["$recomendaria", 1, 0] } },
          total: { $sum: 1 },
        },
      },
    ]);

    const tasaRespuesta    = total > 0 ? Math.round((respondidas / total) * 100) : 0;
    const tasaRecomendacion = promedios?.total > 0 ? Math.round((promedios.recomendarian / promedios.total) * 100) : 0;

    res.json({
      total,
      respondidas,
      pendientes,
      tasaRespuesta,
      promedios: promedios ? {
        atencion:     Math.round(promedios.p1 * 10) / 10,
        satisfaccion: Math.round(promedios.p3 * 10) / 10,
        general:      Math.round(promedios.p5 * 10) / 10,
      } : null,
      tasaRecomendacion,
    });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}