const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Result = require("./models/Result");
const authMiddleware = require("./middleware/authMiddleware");

const router = express.Router();

const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== "superadmin") {
        return res.status(403).json({
            message: "Super admin access required"
        });
    }
    next();
};

// REGISTER
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (role === "superadmin") {
            return res.status(403).json({
                message: "Super admin accounts cannot be created publicly"
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
        });

        await newUser.save();

        res.json({ message: "User Registered Successfully" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
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
            "secretkey",
            { expiresIn: "1d" }
        );

        res.json({
            message: "Login successful",
            token,
            user: {
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// SUPER ADMIN OVERVIEW
router.get("/superadmin/overview", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const [users, assessments] = await Promise.all([
            User.find().select("_id name email role isActive").sort({ name: 1 }),
            Result.countDocuments()
        ]);

        const normalizedUsers = users.map((user) => ({
            ...user.toObject(),
            isActive: user.isActive !== false
        }));

        res.json({
            stats: {
                totalUsers: normalizedUsers.length,
                activeUsers: normalizedUsers.filter((u) => u.isActive).length,
                // ✅ changed "teacher" to "admin"
                administrators: normalizedUsers.filter(
                    (u) => u.role === "admin" || u.role === "superadmin"
                ).length,
                assessments
            },
            users: normalizedUsers
        });

    } catch (err) {
        res.status(500).json({ message: "Error fetching super admin overview" });
    }
});

// UPDATE USER ACCESS
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
        ).select("_id name email role isActive");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);

    } catch (err) {
        res.status(500).json({ message: "Error updating user access" });
    }
});
// TEMP - CREATE SUPERADMIN (DELETE AFTER USE)
router.post("/create-superadmin", async (req, res) => {
  try {
    const existing = await User.findOne({ role: "superadmin" });
    if (existing) {
      return res.status(400).json({ message: "Superadmin already exists" });
    }

    const hashedPassword = await bcrypt.hash("YourSecretPassword123", 10);

    const superAdmin = new User({
      name: "Super Admin",
      email: "superadmin@yourdomain.com",
      password: hashedPassword,
      role: "superadmin",
      isActive: true
    });

    await superAdmin.save();
    res.json({ message: "Superadmin created successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;