import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

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

export async function enviarEmailCierreServicio(destinatarios, servicio) {
  const fecha = new Date(servicio.updatedAt ?? Date.now()).toLocaleDateString("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const monta     = servicio.montacargas;
  const cliente   = servicio.cliente;
  const tecnico   = servicio.tecnicoAsignado;
  const tipo      = servicio.tipoServicio;
  const orden     = servicio.ordenRefaccion;

  const refaccionesHtml = orden?.items?.filter(i => i.cantidadSurtida > 0).map(i =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #2a2d3a;">${i.cantidadSurtida} ${i.refaccion?.unidad ?? ""}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #2a2d3a;">${i.refaccion?.nombre ?? ""}</td>
    </tr>`
  ).join("") ?? "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#0f1117;color:#e8eaf0;border-radius:12px;overflow:hidden;">

      <!-- Header -->
      <div style="background:#1a1d27;padding:24px 32px;border-bottom:3px solid #f0b800;display:flex;align-items:center;gap:16px;">
        <img src="https://res.cloudinary.com/dijxgoytw/image/upload/v1778686227/Pipsa_logo_png_damxzy.png"
             style="width:60px;height:60px;object-fit:contain;background:#000;border-radius:6px;" alt="Pipsa" />
        <div>
          <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">Servicio Cerrado</p>
          <p style="margin:0;font-size:13px;color:#f0b800;">Control Pipsa — Notificación automática</p>
        </div>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px;">

        <p style="margin:0 0 20px;font-size:14px;color:#aab0c6;">
          Se ha cerrado el siguiente servicio el <strong style="color:#fff;">${fecha}</strong>.
        </p>

        <!-- Folio + Tipo -->
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <div style="flex:1;background:#1a1d27;border-radius:8px;padding:14px 18px;border:1px solid #2a2d3a;">
            <p style="margin:0 0 4px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Folio</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#f0b800;">${servicio.folio}</p>
          </div>
          <div style="flex:1;background:#1a1d27;border-radius:8px;padding:14px 18px;border:1px solid #2a2d3a;">
            <p style="margin:0 0 4px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Tipo de servicio</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#fff;">${tipo?.nombre ?? "Sin tipo"}</p>
          </div>
        </div>

        <!-- Equipo y cliente -->
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;background:#1a1d27;border-radius:8px;overflow:hidden;border:1px solid #2a2d3a;">
          <thead>
            <tr style="background:#222537;">
              <th colspan="2" style="padding:10px 16px;text-align:left;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Datos del equipo y cliente</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:8px 16px;color:#7a8099;font-size:13px;width:140px;">Equipo</td>
              <td style="padding:8px 16px;color:#fff;font-size:13px;font-weight:600;">${monta?.numeroEconomico ?? "—"} — ${monta?.marca ?? ""} ${monta?.modelo ?? ""}</td>
            </tr>
            <tr style="background:#222537;">
              <td style="padding:8px 16px;color:#7a8099;font-size:13px;">Cliente</td>
              <td style="padding:8px 16px;color:#fff;font-size:13px;">${cliente?.nombre ?? "Sin cliente"}</td>
            </tr>
            <tr>
              <td style="padding:8px 16px;color:#7a8099;font-size:13px;">Técnico</td>
              <td style="padding:8px 16px;color:#fff;font-size:13px;">${tecnico?.nombre ?? "Sin asignar"}</td>
            </tr>
            <tr style="background:#222537;">
              <td style="padding:8px 16px;color:#7a8099;font-size:13px;">Horómetro entrada</td>
              <td style="padding:8px 16px;color:#fff;font-size:13px;">${servicio.horometro ?? "—"} hrs</td>
            </tr>
            <tr>
              <td style="padding:8px 16px;color:#7a8099;font-size:13px;">Horómetro cierre</td>
              <td style="padding:8px 16px;color:#fff;font-size:13px;">${servicio.horometroCierre ?? "—"} hrs</td>
            </tr>
          </tbody>
        </table>

        <!-- Problema -->
        <div style="background:#1a1d27;border-radius:8px;padding:14px 18px;border:1px solid #2a2d3a;margin-bottom:20px;">
          <p style="margin:0 0 6px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Problema reportado</p>
          <p style="margin:0;font-size:14px;color:#fff;">${servicio.problema ?? "—"}</p>
        </div>

        <!-- Notas de cierre -->
        ${servicio.notasCierre ? `
        <div style="background:#1a1d27;border-radius:8px;padding:14px 18px;border:1px solid #2a2d3a;margin-bottom:20px;">
          <p style="margin:0 0 6px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Trabajos realizados / Notas de cierre</p>
          <p style="margin:0;font-size:14px;color:#fff;">${servicio.notasCierre}</p>
        </div>` : ""}

        <!-- Refacciones utilizadas -->
        ${refaccionesHtml ? `
        <div style="margin-bottom:20px;">
          <p style="margin:0 0 8px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Refacciones utilizadas</p>
          <table style="width:100%;border-collapse:collapse;background:#1a1d27;border-radius:8px;overflow:hidden;border:1px solid #2a2d3a;">
            <thead>
              <tr style="background:#222537;">
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#7a8099;width:80px;">Cantidad</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;color:#7a8099;">Refacción</th>
              </tr>
            </thead>
            <tbody>${refaccionesHtml}</tbody>
          </table>
        </div>` : ""}

        <!-- Costos -->
        <div style="background:#1a1d27;border-radius:8px;padding:14px 18px;border:1px solid #2a2d3a;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Costos</p>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span style="color:#aab0c6;font-size:13px;">Refacciones</span>
            <span style="color:#fff;font-size:13px;">$${(servicio.costoRefacciones ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#aab0c6;font-size:13px;">Mano de obra</span>
            <span style="color:#fff;font-size:13px;">$${(servicio.costoManoObra ?? 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
          <div style="display:flex;justify-content:space-between;border-top:1px solid #2a2d3a;padding-top:10px;">
            <span style="color:#fff;font-size:15px;font-weight:700;">Total</span>
            <span style="color:#f0b800;font-size:15px;font-weight:700;">$${((servicio.costoRefacciones ?? 0) + (servicio.costoManoObra ?? 0)).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        <!-- Fotos -->
        ${servicio.fotoHojaFirmada || servicio.fotoEquipoFinal ? `
        <div style="margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:11px;color:#7a8099;text-transform:uppercase;letter-spacing:.06em;">Evidencia fotográfica</p>
          <div style="display:flex;gap:12px;">
            ${servicio.fotoHojaFirmada ? `
            <div style="flex:1;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;color:#7a8099;">Hoja firmada</p>
              <img src="${servicio.fotoHojaFirmada}" style="width:100%;max-width:240px;border-radius:8px;border:1px solid #2a2d3a;" />
            </div>` : ""}
            ${servicio.fotoEquipoFinal ? `
            <div style="flex:1;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;color:#7a8099;">Equipo finalizado</p>
              <img src="${servicio.fotoEquipoFinal}" style="width:100%;max-width:240px;border-radius:8px;border:1px solid #2a2d3a;" />
            </div>` : ""}
          </div>
        </div>` : ""}

      </div>

      <!-- Footer -->
      <div style="background:#1a1d27;padding:16px 32px;text-align:center;border-top:1px solid #2a2d3a;">
        <p style="margin:0;font-size:12px;color:#7a8099;">Control Pipsa — Sistema de Gestión de Flota</p>
        <p style="margin:4px 0 0;font-size:11px;color:#4a5068;">Este es un mensaje automático, no responder.</p>
      </div>
    </div>
  `;

  for (const dest of destinatarios) {
    await transporter.sendMail({
      from: `"Control Pipsa" <${process.env.MAIL_USER}>`,
      to: dest.email,
      subject: `✅ Servicio cerrado — ${servicio.folio} | ${monta?.numeroEconomico ?? ""} ${monta?.marca ?? ""}`,
      html,
    });
  }
  export async function enviarEmailPago({ tipo, proveedor, total, fechaPago, comprobante }) {
  const fecha = fechaPago
    ? new Date(fechaPago).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;background:#0a0c10;color:#e8eaf0;border-radius:12px;overflow:hidden">
      <div style="background:#111318;padding:24px;border-bottom:2px solid #f59e0b">
        <img src="https://res.cloudinary.com/dijxgoytw/image/upload/v1778686227/Pipsa_logo_png_damxzy.png"
             style="width:60px;background:#000;border-radius:6px;padding:4px" />
        <h2 style="margin:12px 0 0;font-size:1.1rem;color:#f59e0b">Pago registrado</h2>
      </div>
      <div style="padding:24px">
        <p style="margin:0 0 16px;font-size:0.95rem">Se registró un pago de gasto <strong>${tipo}</strong>:</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
          <tr><td style="padding:8px 0;color:#7a8099">Proveedor / Concepto</td><td style="padding:8px 0;font-weight:600">${proveedor}</td></tr>
          <tr><td style="padding:8px 0;color:#7a8099">Total pagado</td><td style="padding:8px 0;font-weight:700;color:#22c55e">$${Number(total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td></tr>
          <tr><td style="padding:8px 0;color:#7a8099">Fecha de pago</td><td style="padding:8px 0">${fecha}</td></tr>
          ${comprobante ? `<tr><td style="padding:8px 0;color:#7a8099">Comprobante</td><td style="padding:8px 0"><a href="${comprobante}" style="color:#4f7cff">Ver comprobante</a></td></tr>` : ""}
        </table>
      </div>
      <div style="padding:16px 24px;background:#111318;font-size:0.78rem;color:#7a8099">
        Control Pipsa — Equipos Industriales y Montacargas de Guadalajara
      </div>
    </div>`;

  await transporter.sendMail({
    from:    `"Control Pipsa" <${process.env.MAIL_USER}>`,
    to:      "admin@pipsamontacargas.com",
    subject: `✅ Pago registrado — ${proveedor}`,
    html,
  });
}
}
