const express    = require("express");
const cors       = require("cors");
const mongoose   = require("mongoose");
require("dotenv").config();

const app = express();

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    // Allows Vercel, Firebase (web.app), and Localhost
    if (!origin || origin.includes("vercel.app") || origin.includes("localhost") || origin.includes("web.app")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.use(express.json());

// ── MongoDB ───────────────────────────────────────────────────
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  // Make sure MONGO_URI is set in your Railway Variables!
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });
  isConnected = true;
  console.log("MongoDB Connected");
};

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

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
// Add both to server.js to stop the 404s
app.use("/api/test-suites", testSuitesRouter);
app.use("/api/test-suite",  testSuitesRouter);

// IMPORTANT: Removed app.use("/api", questionsRoutes) to prevent 404 conflicts

// ── Health check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("<h1>MCQ Test Server Running</h1>");
});

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected Route Accessed", user: req.user });
});

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
// Added '0.0.0.0' for better Railway networking compatibility
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;