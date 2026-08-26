import mongoose from "mongoose";

const encuestaSchema = new mongoose.Schema(
  {
    // Referencia al servicio cerrado
    servicio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Servicio",
      required: true,
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cliente",
      required: true,
    },
    tecnicoAsignado: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Usuario",
    },

    // Token único para el link público (sin login)
    token: {
      type: String,
      required: true,
      unique: true,
    },

    // Estado de la encuesta
    estatus: {
      type: String,
      enum: ["pendiente", "respondida", "expirada"],
      default: "pendiente",
    },

    // Correo al que se envió
    emailEnviado: {
      type: String,
    },

    // Fecha de envío del correo
    fechaEnvio: {
      type: Date,
    },

    // Fecha en que el cliente respondió
    fechaRespuesta: {
      type: Date,
    },

    // ─── Respuestas del cliente ───────────────────────────────────────────────

    // P1: ¿Cómo calificarías la atención recibida por nuestro técnico?
    p1_atencion: {
      type: Number,
      min: 1,
      max: 5,
    },

    // P2: ¿El servicio se realizó en el tiempo acordado?
    p2_tiempoAcordado: {
      type: String,
      enum: ["si", "no", "parcialmente"],
    },

    // P3: ¿Quedaste satisfecho con la solución al problema de tu equipo?
    p3_satisfaccion: {
      type: Number,
      min: 1,
      max: 5,
    },

    // P4: ¿El técnico te explicó claramente el trabajo realizado?
    p4_comunicacion: {
      type: String,
      enum: ["si", "no", "parcialmente"],
    },

    // P5: ¿Cómo calificarías el servicio en general?
    p5_general: {
      type: Number,
      min: 1,
      max: 5,
    },

    // Comentarios adicionales
    comentarios: {
      type: String,
      maxlength: 1000,
    },

    // ¿Recomendarías Pipsa Montacargas?
    recomendaria: {
      type: Boolean,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Encuesta", encuestaSchema);