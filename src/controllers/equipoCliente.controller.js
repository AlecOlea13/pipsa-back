import EquipoCliente from "../models/EquipoCliente.js";
import Servicio from "../models/Servicio.js";

const CAMPOS = [
  "cliente", "numeroEconomico", "marca", "modelo", "serie", "tipo",
  "capacidad", "horometroActual", "ubicacion", "notas", "fotos",
];

function pick(body) {
  const out = {};
  for (const k of CAMPOS) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

export async function getEquiposCliente(req, res) {
  try {
    const filtro = { activo: true };
    if (req.query.cliente) filtro.cliente = req.query.cliente;
    const equipos = await EquipoCliente.find(filtro)
      .populate("cliente", "nombre")
      .sort({ createdAt: -1 });
    res.json(equipos);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function createEquipoCliente(req, res) {
  try {
    const data = pick(req.body);
    if (!data.cliente) return res.status(400).json({ message: "El cliente es obligatorio" });
    if (!data.marca && !data.modelo && !data.serie && !data.numeroEconomico)
      return res.status(400).json({ message: "Captura al menos marca, modelo, serie o número del equipo" });
    const equipo = await EquipoCliente.create(data);
    await equipo.populate("cliente", "nombre");
    res.status(201).json(equipo);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function updateEquipoCliente(req, res) {
  try {
    const data = pick(req.body);
    const equipo = await EquipoCliente.findByIdAndUpdate(req.params.id, data, { new: true })
      .populate("cliente", "nombre");
    if (!equipo) return res.status(404).json({ message: "Equipo no encontrado" });
    res.json(equipo);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

// Baja lógica: el historial de servicios conserva la referencia.
export async function deleteEquipoCliente(req, res) {
  try {
    await EquipoCliente.findByIdAndUpdate(req.params.id, { activo: false });
    res.json({ message: "Equipo eliminado" });
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}

export async function getServiciosPorEquipoCliente(req, res) {
  try {
    const servicios = await Servicio.find({ equipoCliente: req.params.id })
      .populate("cliente",         "nombre")
      .populate("tipoServicio",    "nombre")
      .populate("tecnicoAsignado", "nombre")
      .select("folio estatus fechaReporte problema notasCierre horometro horometroCierre horaInicio horaFin cliente tipoServicio tecnicoAsignado")
      .sort({ createdAt: -1 });
    res.json(servicios);
  } catch (e) {
    res.status(500).json({ message: "Error en el servidor" });
  }
}