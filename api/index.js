import app, { connectDB } from '../server.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://last-to-do-u9vd.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  await connectDB();
  return app(req, res);
}