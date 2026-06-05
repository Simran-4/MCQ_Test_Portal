const express    = require("express");
const cors       = require("cors");
const mongoose   = require("mongoose");
require("dotenv").config();

const app = express();  // ✅ app defined FIRST

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
  origin: function(origin, callback) {
    // Allow all vercel.app previews, localhost, and no-origin (mobile/Postman)
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
const authRoutes       = require("./authRoutes");
const authMiddleware   = require("./middleware/authMiddleware");
const questionRoutes   = require("./routes/questionsR");
const resultRoutes     = require("./routes/resultRoutes");
const settingsRoutes   = require("./routes/settings");
const testSuitesRouter = require("./routes/testSuites");
const questionsRoutes  = require("./routes/questionsRoutes");

app.use("/api/auth",        authRoutes);
app.use("/api/questions",   questionRoutes);
app.use("/api/results",     resultRoutes);
app.use("/api/settings",    settingsRoutes);
app.use("/api/test-suites", testSuitesRouter);
app.use("/api",             questionsRoutes);  // ✅ import/export routes

// ── Health check ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("<h1>MCQ Test Server Running</h1>");
});

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({ message: "Protected Route Accessed", user: req.user });
});

// ── MongoDB ───────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

// ── Start ─────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});