const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createOtp,
  hashOtp,
  otpMatches,
  whatsappRecipient,
} = require("../utils/passwordResetOtp");

test("generates a six-digit OTP and stores only a verifiable hash", () => {
  const otp = createOtp();
  assert.match(otp, /^\d{6}$/);
  const hash = hashOtp(otp);
  assert.notEqual(hash, otp);
  assert.equal(otpMatches(otp, hash), true);
  assert.equal(otpMatches("000000", hash), false);
});

test("formats Indian local and international mobile numbers for WhatsApp", () => {
  assert.equal(whatsappRecipient("90110 20190"), "919011020190");
  assert.equal(whatsappRecipient("+91 90110 20190"), "919011020190");
  assert.equal(whatsappRecipient("0091 90110 20190"), "919011020190");
});
