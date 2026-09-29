const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authRoutes = require("../authRoutes");

test("login selects only the entered identity and refuses shared login IDs", async () => {
  const password = await bcrypt.hash("shared-password", 4);
  const bob = {
    _id: "00000000-0000-4000-8000-000000000002",
    name: "Bob", username: "bob", email: "bob@example.org", mobile: "",
    password, role: "candidate", isActive: true,
  };
  const alice = {
    _id: "00000000-0000-4000-8000-000000000001",
    name: "Alice", username: "alice", email: "alice@example.org", mobile: "9876543210",
    password, role: "candidate", isActive: true,
  };
  const originalFind = User.find;
  let users = [bob, alice];
  User.find = async () => users;

  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRoutes);
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/auth`;
    const post = async (path, body) => {
      const response = await fetch(`${url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };

    for (const identifier of ["alice", "ALICE@EXAMPLE.ORG", "98765 43210"]) {
      const result = await post("/login", { identifier, password: "shared-password" });
      assert.equal(result.status, 200);
      assert.equal(result.body.user._id, alice._id);
      assert.equal(jwt.verify(result.body.token, process.env.JWT_SECRET || "snehalaya2024").id, alice._id);
    }

    users = [bob, alice, {
      ...bob, _id: "00000000-0000-4000-8000-000000000003",
      username: "alice@example.org", email: "other@example.org",
    }];
    const ambiguous = await post("/login", { identifier: "alice@example.org", password: "shared-password" });
    assert.equal(ambiguous.status, 409);
    assert.equal(ambiguous.body.token, undefined);
    assert.equal((await post("/forgot-password", { identifier: "alice@example.org" })).status, 409);
  } finally {
    User.find = originalFind;
    await new Promise(resolve => server.close(resolve));
  }
});
