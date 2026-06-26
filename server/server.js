const express    = require("express");
const cors       = require("cors");
const path       = require("path");
const { connectDatabase } = require("./db/postgres");
require("dotenv").config();

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.includes("localhost")) {
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
app.get("/", (req, res) => res.json({ service: "mcq-test-portal", status: "ok" }));

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected Route Accessed", user: req.user });
});

const clientBuild = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientBuild));
app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientBuild, "index.html"), err => err && next());
});

// ── Start ─────────────────────────────────────────────────────
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDatabase()
    .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`)))
    .catch(err => { console.error("PostgreSQL connection failed:", err.message); process.exit(1); });
}

module.exports = app;
