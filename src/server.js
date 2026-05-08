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

dns.setServers(['1.1.1.1', '8.8.8.8']);
dns.setDefaultResultOrder('ipv4first');

const app = express();
// app.options('/(.*)', (req, res) => {
//   res.setHeader('Access-Control-Allow-Origin', 'https://last-to-do-u9vd.vercel.app');
//   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
//   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.setHeader('Access-Control-Allow-Credentials', 'true');
//   res.sendStatus(204);
// });
app.use(cors({
  origin: [
    "https://last-to-do-u9vd.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
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

// Conexión a MongoDB (sin app.listen — Vercel lo maneja)
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ Falta MONGO_URI en el .env');
}

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    family: 4,
  });
  isConnected = true;
  console.log('✅ Conectado a MongoDB');
}

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000;
  connectDB()
    .then(() => app.listen(PORT, () => console.log(`Servidor en puerto: ${PORT}`)))
    .catch(err => console.error('❌ Error MongoDB:', err.message));
}

export default app;
