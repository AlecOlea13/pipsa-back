import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dns from 'node:dns';
import https from 'node:https';

import cotizacionRoutes from "./routes/cotizacion.routes.js";
import userRoutes from "./routes/user.routes.js";
import authRoutes from './routes/auth.routes.js';
import taskRoutes from './routes/task.routes.js';
import clienteRoutes     from "./routes/cliente.routes.js";
import montacargasRoutes from "./routes/montacargas.routes.js";
import rentaRoutes       from "./routes/renta.routes.js";
import servicioRoutes    from "./routes/servicio.routes.js";
import pendienteRoutes from "./routes/pendiente.routes.js";
import facturacionRoutes from "./routes/facturacion.routes.js";
import asesorRoutes from "./routes/asesor.routes.js";
import refaccionRoutes        from "./routes/refaccion.routes.js";
import tipoServicioRoutes     from "./routes/tipoServicio.routes.js";
import ordenRefaccionRoutes   from "./routes/ordenRefaccion.routes.js";
import refaccionUsadaRoutes   from "./routes/refaccionUsada.routes.js";
import gastoRoutes from "./routes/gasto.routes.js";
import gastoNoFiscalRoutes from "./routes/gastoNoFiscal.routes.js";
import cxcRoutes from "./routes/cxc.routes.js";
import proveedorRoutes from "./routes/proveedor.routes.js";
import portalRoutes from "./routes/portal.routes.js";
import vehiculoRoutes from "./routes/vehiculo.routes.js";
import valeRoutes from "./routes/vale.routes.js";
import valeTornoRoutes from "./routes/valeTorno.routes.js";
import solicitudCompraRoutes from "./routes/solicitudCompra.routes.js";
import resumenRoutes from "./routes/resumen.routes.js";
import encuestaRoutes from "./routes/encuesta.routes.js";
import hallazgoRoutes       from "./routes/hallazgo.routes.js";
import reporteClienteRoutes from "./routes/reporteCliente.routes.js";
import { seedHallazgos }    from "./controllers/hallazgo.controller.js";

dns.setServers(['1.1.1.1', '8.8.8.8']);
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.use(cors({
  origin: [
    "https://last-to-do-u9vd.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(morgan('dev'));

app.get('/', (req, res) => res.json({ ok: true, name: 'Control Pipsa API' }));

// ── Proxy de descarga para PDFs de Cloudinary ─────────────────────────────────
app.get('/api/descargar', (req, res) => {
  const { url, nombre } = req.query;
  if (!url) return res.status(400).json({ message: "url requerida" });

  try {
    const urlObj = new URL(url);
    // Solo permitir descargas de Cloudinary
    if (!urlObj.hostname.includes("cloudinary.com")) {
      return res.status(403).json({ message: "Dominio no permitido" });
    }

    https.get(url, (cloudRes) => {
      const contentType = cloudRes.headers["content-type"] ?? "application/octet-stream";
      const fileName    = nombre ?? "documento";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
      res.setHeader("Access-Control-Allow-Origin", "*");
      cloudRes.pipe(res);
    }).on("error", (e) => {
      console.error("Error proxy descarga:", e.message);
      res.status(500).json({ message: "Error al descargar el archivo" });
    });
  } catch (e) {
    res.status(400).json({ message: "URL inválida" });
  }
});

app.use('/api/auth',  authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clientes',    clienteRoutes);
app.use('/api/montacargas', montacargasRoutes);
app.use('/api/rentas',      rentaRoutes);
app.use('/api/servicios',   servicioRoutes);
app.use("/api/pendientes", pendienteRoutes);
app.use("/api/facturacion", facturacionRoutes);
app.use('/api/cotizaciones', cotizacionRoutes);
app.use('/api/asesores', asesorRoutes);
app.use("/api/refacciones",       refaccionRoutes);
app.use("/api/tipos-servicio",    tipoServicioRoutes);
app.use("/api/ordenes-refaccion", ordenRefaccionRoutes);
app.use("/api/refacciones-usadas", refaccionUsadaRoutes);
app.use("/api/gastos", gastoRoutes);
app.use("/api/gastos-no-fiscales", gastoNoFiscalRoutes);
app.use("/api/cxc", cxcRoutes);
app.use("/api/proveedores", proveedorRoutes);
app.use("/api/portales", portalRoutes);
app.use("/api/vehiculos", vehiculoRoutes);
app.use("/api/vales-salida", valeRoutes);
app.use("/api/vales-torno", valeTornoRoutes);
app.use("/api/solicitudes-compra", solicitudCompraRoutes);
app.use("/api/resumen", resumenRoutes);
app.use("/api/encuestas", encuestaRoutes);
app.use("/api/hallazgos",        hallazgoRoutes);
app.use("/api/reportes-cliente", reporteClienteRoutes);

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) console.error('❌ Falta MONGO_URI en el .env');

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(MONGO_URI, {
    dbName: "test",
    serverSelectionTimeoutMS: 10000,
    family: 4,
  });
  isConnected = true;
  console.log('✅ Conectado a MongoDB');
  await seedHallazgos();
}

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Servidor en puerto: ${PORT}`)))
    .catch(err => console.error('❌ Error MongoDB:', err.message));
}

export default app;