const functions = require("firebase-functions");
const express    = require("express");
const cors       = require("cors");
const mongoose   = require("mongoose");

// ── Load env from Firebase config or process.env ──
const MONGO_URI  = process.env.MONGO_URI  || functions.config().env?.mongo_uri;
const JWT_SECRET = process.env.JWT_SECRET || functions.config().env?.jwt_secret;

// Make available to other modules
process.env.MONGO_URI  = MONGO_URI;
process.env.JWT_SECRET = JWT_SECRET;

const app = express();

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || origin.includes("vercel.app") || origin.includes("localhost")) {
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

// ── Routes ────────────────────────────────────────────────────
const authRoutes       = require("../server/authRoutes");
const authMiddleware   = require("../server/middleware/authMiddleware");
const questionRoutes   = require("../server/routes/questionsR");
const resultRoutes     = require("../server/routes/resultRoutes");
const settingsRoutes   = require("../server/routes/settings");
const testSuitesRouter = require("../server/routes/testSuites");
const questionsRoutes  = require("../server/routes/questionsRoutes");

app.use("/api/auth",        authRoutes);
app.use("/api/questions",   questionRoutes);
app.use("/api/results",     resultRoutes);
app.use("/api/settings",    settingsRoutes);
app.use("/api/test-suites", testSuitesRouter);
app.use("/api",             questionsRoutes);

// ── Health check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("<h1>MCQ Test Server Running on Firebase</h1>");
});

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected Route Accessed", user: req.user });
});

// ── MongoDB ───────────────────────────────────────────────────
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(MONGO_URI);
  isConnected = true;
  console.log("MongoDB Connected");
}

// Connect before handling requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB connection failed:", err);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// ── Export as Firebase Function ───────────────────────────────
exports.api = functions.https.onRequest(app);
