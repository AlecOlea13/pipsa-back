import mongoose from "mongoose";

// ──────────────────────────────────────────────────────────────────────────────
//  OperacionRep — registro de idempotencia para emisión de REP
//
//  Ciclo de vida de una operación:
//
//    pendiente   → El frontend generó la claveIdempotencia y la registró.
//                  Aún no se ha llamado a Enlace Fiscal.
//
//    procesando  → El backend adquirió el bloqueo y va a llamar a EF.
//                  Si el servidor cae aquí, el bloqueo técnico expira en 10 min
//                  pero el estado queda en "procesando" → se promueve a "incierto".
//
//    timbrado    → EF respondió "aceptado". UUID, XML y PDF guardados.
//                  Estado final exitoso.
//
//    incierto    → La petición llegó a EF (o pudo llegar) pero no obtuvimos
//                  respuesta. No se reintenta automáticamente.
//                  Requiere reconciliación manual o por API usando folioEF.
//
//    fallido     → EF respondió con error claro (400). No se timbró.
//                  Se puede reintentar con una NUEVA claveIdempotencia.
//
//  Reconciliación cuando estado = "incierto":
//    - Buscar en el portal EF por folioEF (= folioInterno enviado).
//    - Si EF muestra el CFDI: actualizar a "timbrado" con UUID/PDF/XML.
//    - Si EF no muestra nada: actualizar a "fallido" y habilitar nuevo intento.
//    - Nunca promover automáticamente de "incierto" a ningún estado.
//
//  La claveIdempotencia tiene índice unique: si el frontend la reenvía
//  (doble click, reintento de red), el segundo insert falla y el primero
//  continúa. El frontend la genera UNA vez al abrir el modal de REP y la
//  reutiliza en todos los reintentos de ESA operación.
// ──────────────────────────────────────────────────────────────────────────────

const operacionRepSchema = new mongoose.Schema({

  // ── Bloqueo de factura respaldado por MongoDB ────────────────────────────
  // bloqueoFactura contiene el facturaId SOLO durante estados activos:
  //   pendiente | procesando | aplicando | incierto | timbrado_pendiente_aplicacion
  //
  // El índice unique+sparse sobre este campo garantiza en MongoDB que no
  // existan dos documentos simultáneos con el mismo bloqueoFactura. Si un
  // segundo insert intenta usar el mismo facturaId, MongoDB lanza E11000 y
  // el endpoint responde 409 — sin necesidad de un findOne previo.
  //
  // Al alcanzar un estado terminal (timbrado | fallido) se elimina el campo
  // con $unset, no con $set: null, para que el índice sparse lo ignore y
  // la siguiente operación pueda adquirir el bloqueo limpiamente.
  bloqueoFactura: {
    type:  mongoose.Schema.Types.ObjectId,
    ref:   "Factura",
    // Sin default: undefined — sparse ignora documentos donde el campo no existe
  },

  // ── Identidad de la operación ────────────────────────────────────────────
  claveIdempotencia: {
    type:     String,
    required: true,
    unique:   true,   // índice unique → el segundo insert falla en lugar de duplicar
    index:    true,
  },

  // ── Datos fiscales de la operación ──────────────────────────────────────
  facturaRelacionada: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "Factura",
    required: true,
    index:    true,
  },
  monto:     { type: Number,  required: true },
  fechaPago: { type: Date,    required: true }, // día de pago (del usuario)
  formaPago: { type: String,  default: "03"  },
  referenciaBancaria: { type: String, default: null },

  // ── Folio enviado a Enlace Fiscal ─────────────────────────────────────────
  // folioEF es el folioInterno que enviamos en el body del REP.
  // EF lo devuelve en AckEnlaceFiscal.folioInterno y permite buscarlo
  // en el portal para reconciliación manual.
  folioEF: { type: Number, default: null },

  // ── Estado de la operación ───────────────────────────────────────────────
  estado: {
    type: String,
    enum: [
      "pendiente",
      "procesando",
      // Bloqueo temporal durante la ejecución de /rep/aplicar.
      // Si el servidor cae aquí, un proceso de reconciliación puede
      // promoverlo de vuelta a "timbrado_pendiente_aplicacion".
      "aplicando",
      // EF aceptó + Factura.create y Factura.findByIdAndUpdate exitosos
      "timbrado",
      // EF aceptó + UUID/XML/PDF guardados en OperacionRep,
      // pero falló Factura.create o Factura.findByIdAndUpdate.
      // El sistema puede reaplicar localmente sin volver a llamar a EF.
      "timbrado_pendiente_aplicacion",
      // EF no respondió o la conexión se cortó antes de recibir respuesta.
      // Requiere reconciliación manual por folioEF antes de reintentar.
      "incierto",
      // EF respondió con error claro — no timbró.
      // Se puede reintentar con nueva claveIdempotencia.
      "fallido",
    ],
    default: "pendiente",
    index:   true,
  },

  // ── Hash del payload fiscal ───────────────────────────────────────────────
  // SHA-256 de: facturaRelacionada + monto + fechaPago (YYYY-MM-DD) + formaPago + moneda.
  // Se genera en el backend al crear la operación y se valida si la misma
  // claveIdempotencia llega con datos distintos (posible manipulación o bug).
  payloadHash: { type: String, default: null },

  // ── Control de bloqueo técnico (expiración de "procesando") ─────────────
  // procesandoDesde: timestamp de cuando se cambió a "procesando".
  // Si procesandoDesde tiene más de 10 min Y estado = "procesando",
  // el proceso de adquisición lo promueve a "incierto" en lugar de
  // liberarlo silenciosamente.
  procesandoDesde: { type: Date, default: null },
  aplicandoDesde:  { type: Date, default: null }, // timestamp del inicio de /rep/aplicar

  // ── Resultado exitoso ─────────────────────────────────────────────────────
  uuidRep: { type: String, default: null }, // UUID del CFDI REP
  folioRep: { type: String, default: null }, // "RPA-XXXXXXX"
  urlPdf:  { type: String, default: null },
  urlXml:  { type: String, default: null },
  urlQr:   { type: String, default: null },

  // ── Referencia al REP creado en Factura ──────────────────────────────────
  // repFacturaId: el _id del documento Factura (tipo "rep") creado al timbrar.
  // Se guarda en el mismo paso que "timbrado".
  // Si estado = "timbrado_pendiente_aplicacion", repFacturaId puede ser null
  // (Factura.create falló) — en ese caso la re-aplicación debe crearlo.
  repFacturaId: { type: mongoose.Schema.Types.ObjectId, ref: "Factura", default: null },

  // ── Diagnóstico ──────────────────────────────────────────────────────────
  errorMsg:  { type: String, default: null }, // mensaje de EF si estado = fallido
  nota:      { type: String, default: null }, // nota manual de reconciliación

  // ── Auditoría ─────────────────────────────────────────────────────────────
  solicitadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

}, { timestamps: true });

// ── Índices ──────────────────────────────────────────────────────────────────
//
// bloqueoFactura: unique+sparse
//   • unique: solo un documento puede tener un valor dado de bloqueoFactura.
//   • sparse: los documentos donde el campo no existe (estados terminales) quedan
//     fuera del índice, por lo que múltiples operaciones terminadas para la misma
//     factura coexisten sin conflicto.
//   • Al liberar el bloqueo se usa $unset, NO $set:null.
//     null sí ocupa lugar en un índice sparse y causaría conflicto.
//
// No se combina con otros campos: el índice simple es suficiente y más claro.
operacionRepSchema.index(
  { bloqueoFactura: 1 },
  { unique: true, sparse: true, name: "idx_bloqueoFactura_unique_sparse" }
);

// Índice compuesto para consultas de reconciliación y mensajes descriptivos
operacionRepSchema.index({ facturaRelacionada: 1, estado: 1 }, { name: "idx_facturaRelacionada_estado" });
operacionRepSchema.index({ folioEF: 1 }, { name: "idx_folioEF" });

export default mongoose.model("OperacionRep", operacionRepSchema);