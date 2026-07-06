import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dns from 'node:dns';

import cotizacionRoutes from "./routes/cotizacion.routes.js";
import userRoutes from "./routes/user.routes.js";
import authRoutes from './routes/auth.routes.js';
import taskRoutes from './routes/task.routes.js';
import clienteRoutes     from "./routes/cliente.routes.js";
import montacargasRoutes from "./routes/montacargas.routes.js";
import rentaRoutes       from "./routes/renta.routes.js";
import servicioRoutes    from "./routes/servicio.routes.js";
import facturaRoutes     from "./routes/factura.routes.js";
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
app.use('/api/auth',  authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clientes',    clienteRoutes);
app.use('/api/montacargas', montacargasRoutes);
app.use('/api/rentas',      rentaRoutes);
app.use('/api/servicios',   servicioRoutes);
app.use('/api/facturas',    facturaRoutes);
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
}

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Servidor en puerto: ${PORT}`)))
    .catch(err => console.error('❌ Error MongoDB:', err.message));
}

export default app;