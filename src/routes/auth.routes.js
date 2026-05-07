import { Router } from "express";
import { register, login, profile, verifyEmail } from "../controllers/auth.controller.js";
import { auth } from "../middleware/auth.js";

const router = Router();

router.post('/register',      register);           // Registro
router.post('/login',         login);              // Login
router.get('/verify-email',   verifyEmail);        // Verificación por correo
router.get('/profile',  auth, profile);            // Perfil autenticado

export default router;