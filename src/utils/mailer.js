import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER, // tu correo Gmail
    pass: process.env.MAIL_PASS, // contraseña de aplicación de Google
  },
});

/**
 * Envía el correo de verificación al usuario recién registrado.
 * @param {string} toEmail  - Correo destino
 * @param {string} token    - Token de verificación
 */
export async function sendVerificationEmail(toEmail, token) {
  const base = process.env.FRONTEND_URL || "http://localhost:5173";
  const link = `${base}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"Lonches To-Do" <${process.env.MAIL_USER}>`,
    to: toEmail,
    subject: "Verifica tu correo 🥪",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#151820;color:#e8eaf0;border-radius:16px;">
        <h2 style="margin:0 0 12px;color:#4f7cff;">¡Bienvenido a Lonches To-Do!</h2>
        <p style="margin:0 0 24px;color:#7a8099;">
          Haz clic en el botón para verificar tu cuenta. El enlace expira en <strong style="color:#e8eaf0;">24 horas</strong>.
        </p>
        <a href="${link}"
           style="display:inline-block;padding:12px 28px;background:#4f7cff;color:white;border-radius:8px;text-decoration:none;font-weight:700;">
          Verificar correo
        </a>
        <p style="margin:24px 0 0;font-size:12px;color:#7a8099;">
          Si no creaste una cuenta, ignora este mensaje.
        </p>
      </div>
    `,
  });
}
