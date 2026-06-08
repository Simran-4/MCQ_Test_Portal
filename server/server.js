const express    = require("express");
const cors       = require("cors");
const mongoose   = require("mongoose");
require("dotenv").config();

const app = express();

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
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
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 30000,
  });
  isConnected = true;
  console.log("MongoDB Connected");
};

// Ensure DB connected before every request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

// ── Routes ────────────────────────────────────────────────────
const authRoutes       = require("./authRoutes");
const authMiddleware   = require("./middleware/authMiddleware");
const questionRoutes   = require("./routes/questionsR");
const resultRoutes     = require("./routes/resultRoutes");
const settingsRoutes   = require("./routes/settings");
const testSuitesRouter = require("./routes/testSuites");
const questionsRoutes  = require("./routes/questionsR");

app.use("/api/auth",        authRoutes);
app.use("/api/questions",   questionRoutes);
app.use("/api/results",     resultRoutes);
app.use("/api/settings",    settingsRoutes);
app.use("/api/test-suites", testSuitesRouter);
app.use("/api",             questionsRoutes);

// ── Health check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("<h1>MCQ Test Server Running</h1>");
});

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected Route Accessed", user: req.user });
});

// ── Start (disabled for Vercel serverless) ────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports = app;