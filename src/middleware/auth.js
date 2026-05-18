import jwt from "jsonwebtoken";

export function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "No autorizado" });

  const token = header.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No autorizado" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "changeme");
    req.userId  = decoded.id;
    req.userRol = decoded.rol;
    next();
  } catch {
    res.status(401).json({ message: "Token inválido o expirado" });
  }
}

export function requireRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.userRol))
      return res.status(403).json({ message: "No tienes permiso para esto" });
    next();
  };
}