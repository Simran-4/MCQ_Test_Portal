const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;

function otpSecret() {
  return process.env.PASSWORD_RESET_OTP_SECRET || process.env.JWT_SECRET || "snehalaya2024";
}

function createOtp() {
  const min = 10 ** (OTP_LENGTH - 1);
  return String(crypto.randomInt(min, 10 ** OTP_LENGTH));
}

function hashOtp(otp) {
  return crypto.createHmac("sha256", otpSecret()).update(String(otp)).digest("hex");
}

function otpMatches(otp, storedHash) {
  const suppliedHash = hashOtp(otp);
  const expected = Buffer.from(String(storedHash || ""), "hex");
  const supplied = Buffer.from(suppliedHash, "hex");
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function whatsappRecipient(mobile) {
  let digits = String(mobile || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10) digits = `${process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91"}${digits}`;
  return digits;
}

function whatsappConfiguration() {
  return {
    accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),
    phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
    templateName: String(process.env.WHATSAPP_OTP_TEMPLATE_NAME || "password_reset_otp").trim(),
    templateLanguage: String(process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || "en_US").trim(),
    graphApiVersion: String(process.env.WHATSAPP_GRAPH_API_VERSION || "v21.0").trim(),
  };
}

async function sendWhatsAppOtp({ mobile, otp }) {
  const recipient = whatsappRecipient(mobile);
  const config = whatsappConfiguration();
  if (!recipient || recipient.length < 10) throw new Error("A valid WhatsApp mobile number is required");
  if (!config.accessToken || !config.phoneNumberId) {
    const error = new Error("WhatsApp OTP service is not configured");
    error.code = "WHATSAPP_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: config.templateName,
        language: { code: config.templateLanguage },
        components: [{
          type: "body",
          parameters: [
            { type: "text", text: String(otp) },
            { type: "text", text: String(OTP_EXPIRY_MINUTES) },
          ],
        }],
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error("WhatsApp could not send the OTP");
    error.code = "WHATSAPP_DELIVERY_FAILED";
    error.detail = detail.slice(0, 500);
    throw error;
  }
}

module.exports = {
  OTP_EXPIRY_MINUTES,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  createOtp,
  hashOtp,
  otpMatches,
  whatsappRecipient,
  sendWhatsAppOtp,
};
