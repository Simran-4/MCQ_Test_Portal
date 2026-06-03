const express = require("express");
const cors = require("cors");                          // âœ… only once
const mongoose = require("mongoose");
const settingsRoutes = require("./routes/settings");
const authRoutes = require("./authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const questionRoutes = require("./routes/questionsR");
const resultRoutes = require("./routes/resultRoutes");
const testSuitesRouter = require("./routes/testSuites");

require("dotenv").config();

const app = express();

// âœ… Single CORS setup â€” allows your Netlify frontend
app.use(cors({
  origin: "*",                  // or replace * with your Netlify URL for more security
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/test-suites", testSuitesRouter);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("<h1>MCQ Test Server Running</h1>");
});

app.get("/api/protected", authMiddleware, (req, res) => {
  res.json({
    message: "Protected Route Accessed",
    user: req.user
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});