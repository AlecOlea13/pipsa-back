// controllers/hallazgo.controller.js
import Hallazgo from "../models/Hallazgo.js";

// Hallazgos precargados — se insertan si no existen al arrancar
export const HALLAZGOS_SEED = [
  {
    clave: "NC_01", numero: 1,
    nombre: "Licencia Municipal",
    descripcion: "El proveedor carece de la Licencia de Funcionamiento Municipal vigente para el inmueble utilizado como centro de almacenamiento, reparación y distribución de montacargas.",
    clasificacion: "mayor",
    proceso: "Información legal y organizacional",
  },
  {
    clave: "NC_02", numero: 2,
    nombre: "Protección Civil",
    descripcion: "El proveedor no presentó un Dictamen de Protección Civil para las instalaciones donde desarrolla actividades de almacenamiento, mantenimiento y reparación de montacargas.",
    clasificacion: "mayor",
    proceso: "Información legal y organizacional",
  },
  {
    clave: "NC_04", numero: 4,
    nombre: "Control de Plagas",
    descripcion: "El proveedor carece de un sistema integral documentado de control de plagas y no exhibió certificados vigentes, cronogramas ni registros de ejecución.",
    clasificacion: "mayor",
    proceso: "Calidad",
  },
  {
    clave: "NC_05", numero: 5,
    nombre: "Mantenimiento Preventivo",
    descripcion: "El proveedor carece de un programa formal de mantenimiento preventivo para los montacargas y no exhibió bitácoras, registros periódicos ni planes de mantenimiento.",
    clasificacion: "mayor",
    proceso: "Calidad",
  },
  {
    clave: "NC_06", numero: 6,
    nombre: "Encuesta de Satisfacción",
    descripcion: "El proveedor no ejecuta encuestas de satisfacción ni mecanismos documentados de retroalimentación con una periodicidad mínima anual.",
    clasificacion: "menor",
    proceso: "Garantías a clientes",
  },
  {
    clave: "NC_07", numero: 7,
    nombre: "Quejas y Reclamaciones",
    descripcion: "El seguimiento a quejas se realiza de manera oportuna, pero principalmente mediante WhatsApp, sin un registro centralizado y formalizado que asegure trazabilidad.",
    clasificacion: "menor",
    proceso: "Garantías a clientes",
  },
  {
    clave: "NC_08", numero: 8,
    nombre: "Aspectos e Impactos Ambientales",
    descripcion: "El proveedor carece de un diagnóstico e identificación formal de los aspectos e impactos ambientales derivados de sus actividades.",
    clasificacion: "mayor",
    proceso: "Gestión ambiental",
  },
];

export async function seedHallazgos() {
  for (const h of HALLAZGOS_SEED) {
    await Hallazgo.updateOne({ clave: h.clave }, { $setOnInsert: h }, { upsert: true });
  }
}

export async function getHallazgos(req, res) {
  try {
    const hallazgos = await Hallazgo.find().sort({ numero: 1 })
      .populate("documentos.subidoPor", "nombre");
    res.json(hallazgos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function subirDocumento(req, res) {
  try {
    const { id } = req.params;
    const { url, nombre, tipo, nota } = req.body;

    if (!url || !nombre || !tipo) {
      return res.status(400).json({ message: "url, nombre y tipo son requeridos" });
    }

    const hallazgo = await Hallazgo.findById(id);
    if (!hallazgo) return res.status(404).json({ message: "Hallazgo no encontrado" });

    const version = hallazgo.documentos.length + 1;
    hallazgo.documentos.push({
      version,
      url,
      nombre,
      tipo,
      nota: nota ?? "",
      subidoPor: req.userId,
      fecha: new Date(),
    });

    await hallazgo.save();
    await hallazgo.populate("documentos.subidoPor", "nombre");
    res.json(hallazgo);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function eliminarDocumento(req, res) {
  try {
    const { id, docId } = req.params;
    const hallazgo = await Hallazgo.findById(id);
    if (!hallazgo) return res.status(404).json({ message: "Hallazgo no encontrado" });

    hallazgo.documentos = hallazgo.documentos.filter(d => String(d._id) !== docId);
    await hallazgo.save();
    res.json(hallazgo);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}