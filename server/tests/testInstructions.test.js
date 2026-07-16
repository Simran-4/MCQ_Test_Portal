const test = require("node:test");
const assert = require("node:assert/strict");

const {
  MAX_TEST_INSTRUCTIONS_LENGTH,
  normalizeTestInstructions,
} = require("../utils/testInstructions");
const TestSuite = require("../models/TestSuite");

test("normalizes instruction line endings while preserving multiline text", () => {
  assert.equal(
    normalizeTestInstructions("  Read every question.\r\nDo not refresh.\rStart only when ready.  "),
    "Read every question.\nDo not refresh.\nStart only when ready."
  );
});

test("accepts empty legacy instructions", () => {
  assert.equal(normalizeTestInstructions(undefined), "");
  assert.equal(normalizeTestInstructions("   "), "");
  assert.equal(new TestSuite({ name: "Legacy suite" }).instructions, "");
});

test("rejects non-text and oversized instructions", () => {
  assert.throws(
    () => normalizeTestInstructions({ text: "unsafe" }),
    error => error?.statusCode === 400
  );
  assert.throws(
    () => normalizeTestInstructions("x".repeat(MAX_TEST_INSTRUCTIONS_LENGTH + 1)),
    error => error?.statusCode === 400
  );
});

test("keeps instruction content as literal plain text", () => {
  assert.equal(
    normalizeTestInstructions("<script>alert('xss')</script>\nRead carefully."),
    "<script>alert('xss')</script>\nRead carefully."
  );
});
