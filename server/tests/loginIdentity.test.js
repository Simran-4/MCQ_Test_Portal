const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authRoutes = require("../authRoutes");

test("login uses a uniquely matching password without confusing duplicate accounts", async () => {
  const password = await bcrypt.hash("shared-password", 4);
  const adminPassword = await bcrypt.hash("admin-only-password", 4);
  const candidatePassword = await bcrypt.hash("candidate-only-password", 4);
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

    users = [
      { ...alice, role: "superadmin", email: "shared@example.org", password: adminPassword },
      { ...bob, email: "shared@example.org", password: candidatePassword },
    ];
    const adminLogin = await post("/login", {
      identifier: "shared@example.org", password: "admin-only-password",
    });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.body.user._id, alice._id);
    assert.equal(adminLogin.body.user.role, "superadmin");
    assert.equal(jwt.verify(adminLogin.body.token, process.env.JWT_SECRET || "snehalaya2024").id, alice._id);

    const candidateLogin = await post("/login", {
      identifier: "shared@example.org", password: "candidate-only-password",
    });
    assert.equal(candidateLogin.status, 200);
    assert.equal(candidateLogin.body.user._id, bob._id);
    assert.equal(candidateLogin.body.user.role, "candidate");

    users[0].isActive = false;
    const disabledAdmin = await post("/login", {
      identifier: "shared@example.org", password: "admin-only-password",
    });
    assert.equal(disabledAdmin.status, 403);
    assert.equal(disabledAdmin.body.token, undefined);
    users[0].isActive = true;

    const wrongPassword = await post("/login", {
      identifier: "shared@example.org", password: "not-the-password",
    });
    assert.equal(wrongPassword.status, 400);
    assert.equal(wrongPassword.body.token, undefined);

    users[1].password = adminPassword;
    const sharedPassword = await post("/login", {
      identifier: "shared@example.org", password: "admin-only-password",
    });
    assert.equal(sharedPassword.status, 409);
    assert.equal(sharedPassword.body.token, undefined);
  } finally {
    User.find = originalFind;
    await new Promise(resolve => server.close(resolve));
  }
});
