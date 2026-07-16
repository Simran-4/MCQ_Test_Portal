const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const fs         = require("fs");
const { connectDatabase } = require("./db/postgres");
const activityLogger = require("./middleware/activityLogger");
require("dotenv").config();

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin: function(origin, callback) {
    const isLocalhost = origin && origin.includes("localhost");
    const isCloudJiffyApp = origin && /^https?:\/\/([a-z0-9-]+\.)?cloudjiffy\.net$/i.test(origin);
    const isSnehalayaCrmDomain = origin && /^https?:\/\/([a-z0-9-]+\.)?snehalayacrm\.org$/i.test(origin);
    if (!origin || allowedOrigins.includes(origin) || isLocalhost || isCloudJiffyApp || isSnehalayaCrmDomain) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json({ limit: "8mb" }));
app.use(activityLogger);

// ── PostgreSQL ───────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── Routes ────────────────────────────────────────────────────
// 1. Import the Route Files
const authRoutes       = require("./authRoutes");
const authMiddleware   = require("./middleware/authMiddleware");
const questionRoutes   = require("./routes/questionsR");
const resultRoutes     = require("./routes/resultRoutes"); // Was missing require
const settingsRoutes   = require("./routes/settings");     // Was missing require
const testSuitesRouter = require("./routes/testSuites");

// 2. Use the Routes
app.use("/api/auth",        authRoutes);
app.use("/api/questions",   questionRoutes);
app.use("/api/results",     resultRoutes);
app.use("/api/settings",    settingsRoutes);

// Correctly handle both singular and plural to prevent 404s
app.use("/api/test-suites", testSuitesRouter);
app.use("/api/test-suite",  testSuitesRouter);
// IMPORTANT: Removed app.use("/api", questionsRoutes) to prevent 404 conflicts

// ── Health check ──────────────────────────────────────────────
app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected Route Accessed", user: req.user });
});

const clientBuild = path.join(__dirname, "..", "client", "dist");
const clientAssets = path.join(clientBuild, "assets");

function findClientBundle(callback) {
  fs.readdir(clientAssets, (dirErr, files) => {
    if (dirErr) return callback(dirErr);

    const bundleFile = files.find(file => /^(index|app)-.*\.js$/.test(file));
    if (!bundleFile) return callback(new Error("Client bundle not found"));

    callback(null, bundleFile);
  });
}

app.get("/legacy-app.js", (req, res, next) => {
  findClientBundle((bundleErr, bundleFile) => {
    if (bundleErr) return next(bundleErr);
    fs.readFile(path.join(clientAssets, bundleFile), "utf8", (fileErr, code) => {
      if (fileErr) return next(fileErr);
      res
        .type("application/javascript")
        .set("Cache-Control", "no-store")
        .send(code.replace(/\s*export\{[^}]+\};?\s*$/, ""));
    });
  });
});

app.use(express.static(clientBuild, { index: false }));
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  findClientBundle((bundleErr, bundleFile) => {
    if (bundleErr) return next(bundleErr);
    fs.readFile(path.join(clientBuild, "index.html"), "utf8", (err, html) => {
      if (err) return next(err);
      const legacyScript = `<script src="/legacy-app.js?v=${encodeURIComponent(bundleFile)}"></script>`;
      const compatibleHtml = html
        .replace(/<script type="module"[^>]+src="\/assets\/(index|app)-[^"]+\.js"[^>]*><\/script>/, legacyScript)
        .replace(/\s+crossorigin/g, "");
      res.type("html").set("Cache-Control", "no-store").send(compatibleHtml);
    });
  });
});

// ── Start ─────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDatabase()
    .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error("PostgreSQL connection failed:", err.message); process.exit(1); });
}

module.exports = app;
