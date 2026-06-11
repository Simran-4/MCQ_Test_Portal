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

function normalizeUsername(value) {
    return String(value || "").toLowerCase().trim().replace(/\s+/g, "");
}

function normalizeMobile(value) {
    return String(value || "").replace(/[^\d+]/g, "").trim();
}

function normalizeEmail(value) {
    return String(value || "").toLowerCase().trim();
}

function isSyntheticMobileEmail(email) {
    return /@mobile\.local$/i.test(String(email || ""));
}

function publicUser(user) {
    return {
        _id:         user._id,
        name:        user.name,
        username:    user.username || "",
        email:       isSyntheticMobileEmail(user.email) ? "" : user.email,
        mobile:      user.mobile || "",
        role:        user.role,
        customRole:  user.customRole,
        isActive:    user.isActive,
        age:         user.age,
        gender:      user.gender,
        project:     user.project,
        designation: user.designation,
    };
}

// ── REGISTER ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
    try {
        const { name, email, mobile, username, password, role, age, gender, project, designation } = req.body;

        const normalizedEmail = normalizeEmail(email);
        const normalizedMobile = normalizeMobile(mobile);
        const normalizedUsername = normalizeUsername(username || name);
        const normalizedRole = String(role || "candidate").toLowerCase().trim();

        if (normalizedRole === "superadmin") {
            return res.status(403).json({
                message: "Super admin accounts cannot be created publicly"
            });
        }

        if (!String(name || "").trim() || String(name || "").trim().length < 2) {
            return res.status(400).json({ message: "Name must be at least 2 characters" });
        }

        if (!normalizedUsername || normalizedUsername.length < 3) {
            return res.status(400).json({ message: "Username must be at least 3 characters" });
        }

        if (!normalizedEmail && !normalizedMobile) {
            return res.status(400).json({ message: "Enter either email or mobile number" });
        }

        if (normalizedEmail && (!normalizedEmail.includes("@") || !normalizedEmail.includes("."))) {
            return res.status(400).json({ message: "Enter a valid email address" });
        }

        if (normalizedMobile && normalizedMobile.replace(/\D/g, "").length < 10) {
            return res.status(400).json({ message: "Enter a valid mobile number" });
        }

        if (!password || String(password).length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const storedEmail = normalizedEmail || `${normalizedUsername}@mobile.local`;

        const existingUser = await User.findOne({
            $or: [
                { username: normalizedUsername },
                { email: storedEmail },
                ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
                ...(normalizedMobile ? [{ mobile: normalizedMobile }] : []),
            ],
        });
        if (existingUser) {
            return res.status(400).json({ message: "Username, email, or mobile number already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name: String(name || "").trim(),
            username: normalizedUsername,
            email: storedEmail,
            mobile: normalizedMobile || undefined,
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
        const { email, identifier, username, mobile, password } = req.body;
        const rawIdentifier = String(identifier || username || mobile || email || "").trim();
        if (!rawIdentifier) {
            return res.status(400).json({ message: "Username, email, or mobile number is required" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }
        const normalizedIdentifier = normalizeEmail(rawIdentifier);
        const normalizedUsername = normalizeUsername(rawIdentifier);
        const normalizedMobile = normalizeMobile(rawIdentifier);

        const user = await User.findOne({
            $or: [
                { email: normalizedIdentifier },
                { username: normalizedUsername },
                { mobile: normalizedMobile },
            ],
        });
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
            user: publicUser(user),
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── FORGOT PASSWORD REQUEST ───────────────────────────────────
router.post("/forgot-password", async (req, res) => {
    try {
        const rawIdentifier = String(req.body.identifier || req.body.email || "").trim();
        if (!rawIdentifier) {
            return res.status(400).json({ message: "Username, email, or mobile number is required" });
        }

        await User.findOne({
            $or: [
                { email: normalizeEmail(rawIdentifier) },
                { username: normalizeUsername(rawIdentifier) },
                { mobile: normalizeMobile(rawIdentifier) },
            ],
        });
        res.json({
            message: "If this account is registered, please contact the IT Department to reset the password.",
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
            users: users.map(publicUser)
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
        ).select("_id name username email mobile role customRole isActive age gender project designation");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(publicUser(user));

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
        ).select("_id name username email mobile role customRole isActive age gender project designation");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({
            message: "Password reset successfully",
            user: publicUser(user),
        });

    } catch (err) {
        res.status(500).json({ message: "Error resetting password" });
    }
});

// ── ADMIN USER LIST FOR MAIL / ASSIGNMENT ─────────────────────
router.get("/users", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
    try {
        const users = await User.find().select("_id name username email mobile role customRole isActive project designation").sort({ name: 1 });
        res.json(users.map(publicUser));
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
        ).select("_id name username email mobile role customRole isActive age gender project designation");

        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(publicUser(user));
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
