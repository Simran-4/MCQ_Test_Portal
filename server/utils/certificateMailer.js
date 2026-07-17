const nodemailer = require("nodemailer");

function smtpConfiguration() {
  const host = String(process.env.SMTP_HOST || "").trim();
  const user = String(process.env.SMTP_USER || "").trim();
  const password = String(process.env.SMTP_PASSWORD || "");
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;
  return {
    host,
    port,
    secure,
    user,
    password,
    from: String(process.env.SMTP_FROM || user).trim(),
  };
}

function smtpIsConfigured(config = smtpConfiguration()) {
  return Boolean(config.host && config.user && config.password && config.from && Number.isInteger(config.port));
}

async function sendCertificateEmail({ to, subject, text, fileName, pdf }) {
  const config = smtpConfiguration();
  if (!smtpIsConfigured(config)) {
    const error = new Error("Certificate email is not configured");
    error.code = "SMTP_NOT_CONFIGURED";
    throw error;
  }
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  });
  await transport.sendMail({
    from: config.from,
    to,
    subject,
    text,
    attachments: [{
      filename: fileName,
      content: pdf,
      contentType: "application/pdf",
    }],
  });
}

module.exports = { smtpConfiguration, smtpIsConfigured, sendCertificateEmail };
