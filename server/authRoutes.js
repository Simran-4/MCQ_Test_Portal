const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Result = require("./models/Result");
const authMiddleware = require("./middleware/authMiddleware");

const router = express.Router();

// Helper to restrict to Super Admin
const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== "superadmin") {
        return res.status(403).json({
            message: "Super admin access required"
        });
    }
    next();
};

// ── REGISTER ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, role, age, gender, project, designation } = req.body;

        // Normalize email and role to lowercase
        const normalizedEmail = email.toLowerCase().trim();
        const normalizedRole = role.toLowerCase().trim();

        if (normalizedRole === "superadmin") {
            return res.status(403).json({
                message: "Super admin accounts cannot be created publicly"
            });
        }

        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: normalizedRole,
            age:         parseInt(age)   || null,
            gender:      gender          || "",
            project:     project.trim()  || "",
            designation: designation.trim() || "",
        });

        await newUser.save();

        res.json({ message: "User Registered Successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── LOGIN ─────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        if (user.isActive === false) {
            return res.status(403).json({ message: "Your account has been disabled" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

      const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "snehalaya2024", // Match the Railway value
    { expiresIn: "1d" }
);

        res.json({
            message: "Login successful",
            token,
            user: {
                name:        user.name,
                email:       user.email,
                role:        user.role,
                age:         user.age,
                gender:      user.gender,
                project:     user.project,
                designation: user.designation,
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ENHANCED SUPER ADMIN OVERVIEW ──
router.get("/superadmin/overview", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const [users, totalResults, passedResults] = await Promise.all([
            User.find().select("-password").sort({ name: 1 }),
            Result.countDocuments(),
            Result.countDocuments({ passed: true }) // Assuming 'passed' is in your Result model
        ]);

        res.json({
            stats: {
                totalUsers: users.length,
                activeUsers: users.filter(u => u.isActive !== false).length,
                administrators: users.filter(u => u.role === "admin" || u.role === "superadmin").length,
                totalAssessments: totalResults,
                overallPassRate: totalResults > 0 ? Math.round((passedResults / totalResults) * 100) : 0
            },
            users
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching overview" });
    }
});

// ── UPDATE USER ACCESS ───────────────────────────────────────
router.put("/superadmin/users/:id/access", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({ message: "isActive must be a boolean" });
        }

        if (req.user.id === req.params.id && !isActive) {
            return res.status(400).json({ message: "You cannot disable your own account" });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isActive },
            { new: true }
        ).select("_id name email role isActive age gender project designation");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);

    } catch (err) {
        res.status(500).json({ message: "Error updating user access" });
    }
});

module.exports = router;