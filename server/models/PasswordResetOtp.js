const { createModel } = require("./postgresModel");

// Stored in PostgreSQL's app_documents table. OTP values are hashed and are
// never persisted or returned by the API.
module.exports = createModel("PasswordResetOtp", {
  userId: "",
  otpHash: "",
  expiresAt: "",
  attempts: 0,
  lastSentAt: "",
  usedAt: "",
});
