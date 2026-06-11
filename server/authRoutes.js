const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Result = require("./models/Result");
const RoleDefinition = require("./models/RoleDefinition");
const OrgOption = require("./models/OrgOption");
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

const requireAdminOrSuperAdmin = (req, res, next) => {
    if (!["admin", "superadmin"].includes(req.user.role)) {
        return res.status(403).json({ message: "Admin access required" });
    }
    next();
};

const systemRoles = [
    { name: "candidate", baseRole: "candidate", system: true, description: "Candidate / student access" },
    { name: "admin", baseRole: "admin", system: true, description: "Admin dashboard access" },
    { name: "superadmin", baseRole: "admin", system: true, description: "Full system access" },
];

async function getOrgOptionsDoc() {
    return OrgOption.findOneAndUpdate(
        { key: "default" },
        { $setOnInsert: { key: "default", projects: [] } },
        { upsert: true, new: true }
    );
}

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
            project:     String(project || "").trim(),
            designation: String(designation || "").trim(),
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
                customRole:  user.customRole,
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

// ── FORGOT PASSWORD REQUEST ───────────────────────────────────
router.post("/forgot-password", async (req, res) => {
    try {
        const email = String(req.body.email || "").toLowerCase().trim();
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        await User.findOne({ email });
        res.json({
            message: "If this email is registered, please contact the IT Department to reset the password.",
            contactEmail: "crm@snehalaya.org",
            contactPhone: "9011020190",
        });
    } catch (err) {
        res.status(500).json({ message: "Unable to process reset request" });
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
        ).select("_id name email role customRole isActive age gender project designation");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);

    } catch (err) {
        res.status(500).json({ message: "Error updating user access" });
    }
});

// ── RESET USER PASSWORD ──────────────────────────────────────
router.put("/superadmin/users/:id/password", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const password = String(req.body.password || "");

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { password: hashedPassword },
            { new: true }
        ).select("_id name email role customRole isActive age gender project designation");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            message: "Password reset successfully",
            user,
        });

    } catch (err) {
        res.status(500).json({ message: "Error resetting password" });
    }
});

// ── ADMIN USER LIST FOR MAIL / ASSIGNMENT ─────────────────────
router.get("/users", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
    try {
        const users = await User.find().select("_id name email role customRole isActive project designation").sort({ name: 1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: "Error fetching users" });
    }
});

// ── SUPER ADMIN ROLE MANAGEMENT ───────────────────────────────
router.get("/superadmin/roles", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const customRoles = await RoleDefinition.find().sort({ name: 1 });
        res.json([...systemRoles, ...customRoles.map(role => ({
            _id: role._id,
            name: role.name,
            baseRole: role.baseRole,
            description: role.description,
            system: false,
        }))]);
    } catch (err) {
        res.status(500).json({ message: "Error fetching roles" });
    }
});

router.post("/superadmin/roles", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const baseRole = req.body.baseRole === "admin" ? "admin" : "candidate";
        const description = String(req.body.description || "").trim();

        if (!name) return res.status(400).json({ message: "Role name is required" });
        if (systemRoles.some(role => role.name.toLowerCase() === name.toLowerCase())) {
            return res.status(400).json({ message: "This system role already exists" });
        }

        const role = await RoleDefinition.create({ name, baseRole, description });
        res.status(201).json(role);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Role already exists" });
        res.status(500).json({ message: "Error creating role" });
    }
});

router.put("/superadmin/users/:id/role", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const roleName = String(req.body.role || "").trim();
        if (!roleName) return res.status(400).json({ message: "Role is required" });

        let nextRole = roleName;
        let customRole = "";
        if (!systemRoles.some(role => role.name === roleName)) {
            const roleDefinition = await RoleDefinition.findOne({ name: roleName });
            if (!roleDefinition) return res.status(404).json({ message: "Role not found" });
            nextRole = roleDefinition.baseRole;
            customRole = roleDefinition.name;
        }

        if (req.user.id === req.params.id && nextRole !== "superadmin") {
            return res.status(400).json({ message: "You cannot remove your own super admin access" });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role: nextRole, customRole },
            { new: true }
        ).select("_id name email role customRole isActive age gender project designation");

        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (err) {
        res.status(500).json({ message: "Error updating user role" });
    }
});

// ── PROJECT / DEPARTMENT OPTIONS ──────────────────────────────
router.get("/org-options", async (req, res) => {
    try {
        const doc = await getOrgOptionsDoc();
        res.json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error fetching organization options" });
    }
});

router.post("/superadmin/org-options/projects", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        if (!name) return res.status(400).json({ message: "Project name is required" });

        const doc = await getOrgOptionsDoc();
        if (!doc.projects.some(project => project.name.toLowerCase() === name.toLowerCase())) {
            doc.projects.push({ name, departments: [] });
            await doc.save();
        }
        res.status(201).json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error saving project" });
    }
});

router.post("/superadmin/org-options/departments", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const projectName = String(req.body.project || "").trim();
        const department = String(req.body.department || "").trim();
        if (!projectName || !department) {
            return res.status(400).json({ message: "Project and department are required" });
        }

        const doc = await getOrgOptionsDoc();
        let project = doc.projects.find(item => item.name.toLowerCase() === projectName.toLowerCase());
        if (!project) {
            doc.projects.push({ name: projectName, departments: [] });
            project = doc.projects[doc.projects.length - 1];
        }
        if (!project.departments.some(item => item.toLowerCase() === department.toLowerCase())) {
            project.departments.push(department);
        }
        await doc.save();
        res.status(201).json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error saving department" });
    }
});

module.exports = router;
