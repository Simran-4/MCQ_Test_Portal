const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const settingsRoutes =
require("./routes/settings");

const authRoutes = require("./authRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const questionRoutes = require("./routes/questionsR");
const resultRoutes = require("./routes/resultRoutes");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/results", resultRoutes);
app.use(
  "/api/settings",
  settingsRoutes
);

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

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});