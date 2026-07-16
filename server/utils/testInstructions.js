const MAX_TEST_INSTRUCTIONS_LENGTH = 10_000;

function instructionValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normalizeTestInstructions(value) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw instructionValidationError("Test instructions must be plain text.");
  }

  const instructions = value.replace(/\r\n?/g, "\n").trim();
  if (instructions.length > MAX_TEST_INSTRUCTIONS_LENGTH) {
    throw instructionValidationError(
      `Test instructions cannot exceed ${MAX_TEST_INSTRUCTIONS_LENGTH.toLocaleString("en-IN")} characters.`
    );
  }
  return instructions;
}

module.exports = {
  MAX_TEST_INSTRUCTIONS_LENGTH,
  normalizeTestInstructions,
};
