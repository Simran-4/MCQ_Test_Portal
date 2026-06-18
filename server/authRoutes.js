const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Result = require("./models/Result");
const RoleDefinition = require("./models/RoleDefinition");
const OrgOption = require("./models/OrgOption");
const authMiddleware = require("./middleware/authMiddleware");
const {
    ADMIN_PERMISSION_DEFAULTS,
    normalizeAdminPermissions,
    hasAdminPermission,
    matchesUserScope,
} = require("./utils/adminPermissions");

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

async function resolveRole(roleName) {
    const requested = String(roleName || "candidate").toLowerCase().trim();
    if (requested === "superadmin") return { error: "Super admin accounts cannot be created here" };
    if (requested === "admin") return { role: "admin", customRole: "" };
    if (requested === "candidate") return { role: "candidate", customRole: "" };

    const custom = await RoleDefinition.findOne({ name: String(roleName || "").trim() });
    if (!custom) return { error: "Selected role was not found" };
    if (custom.disabled) return { error: "Selected role is disabled" };
    return { role: custom.baseRole, customRole: custom.name };
}

async function resolveRoleForUpdate(roleName, currentRole) {
    const rawRole = String(roleName || currentRole || "candidate").trim();
    const requested = rawRole.toLowerCase();
    if (requested === "superadmin") return { role: "superadmin", customRole: "" };
    return resolveRole(rawRole);
}

async function createUserFromPayload(payload, options = {}) {
    const { name, email, mobile, username, password, age, gender, project, designation } = payload;
    const normalizedEmail = normalizeEmail(email);
    const normalizedMobile = normalizeMobile(mobile);
    const normalizedUsername = normalizeUsername(username || name);
    const roleInfo = await resolveRole(payload.role || "candidate");

    if (roleInfo.error) {
        return { status: 403, error: roleInfo.error };
    }

    if (!options.allowAdmin && roleInfo.role !== "candidate") {
        return { status: 403, error: "Admin accounts must be created by Super Admin" };
    }

    if (!String(name || "").trim() || String(name || "").trim().length < 2) {
        return { status: 400, error: "Name must be at least 2 characters" };
    }

    if (!normalizedUsername || normalizedUsername.length < 3) {
        return { status: 400, error: "Username must be at least 3 characters" };
    }

    if (!normalizedEmail && !normalizedMobile) {
        return { status: 400, error: "Enter either email or mobile number" };
    }

    if (normalizedEmail && (!normalizedEmail.includes("@") || !normalizedEmail.includes("."))) {
        return { status: 400, error: "Enter a valid email address" };
    }

    if (normalizedMobile && normalizedMobile.replace(/\D/g, "").length < 10) {
        return { status: 400, error: "Enter a valid mobile number" };
    }

    if (!password || String(password).length < 6) {
        return { status: 400, error: "Password must be at least 6 characters" };
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
        return { status: 400, error: "Username, email, or mobile number already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
        name: String(name || "").trim(),
        username: normalizedUsername,
        email: storedEmail,
        mobile: normalizedMobile || undefined,
        password: hashedPassword,
        role: roleInfo.role,
        customRole: roleInfo.customRole || "",
        age:         parseInt(age)   || null,
        gender:      gender          || "",
        project:     String(project || "").trim(),
        designation: String(designation || "").trim(),
        isActive:    payload.isActive === undefined ? true : Boolean(payload.isActive),
    });

    await newUser.save();
    return { user: newUser };
}

async function updateUserFromPayload(userId, payload, requesterId) {
    const user = await User.findById(userId);
    if (!user) {
        return { status: 404, error: "User not found" };
    }

    const name = String(payload.name || "").trim();
    const normalizedUsername = normalizeUsername(payload.username || name);
    const normalizedEmail = normalizeEmail(payload.email);
    const normalizedMobile = normalizeMobile(payload.mobile);
    const roleInfo = await resolveRoleForUpdate(payload.role || user.customRole || user.role, user.role);
    const isActive = payload.isActive === undefined ? user.isActive !== false : Boolean(payload.isActive);
    const age = payload.age === "" || payload.age === null || payload.age === undefined
        ? null
        : Number(payload.age);

    if (roleInfo.error) {
        return { status: 403, error: roleInfo.error };
    }

    if (!name || name.length < 2) {
        return { status: 400, error: "Name must be at least 2 characters" };
    }

    if (!normalizedUsername || normalizedUsername.length < 3) {
        return { status: 400, error: "Username must be at least 3 characters" };
    }

    if (!normalizedEmail && !normalizedMobile) {
        return { status: 400, error: "Enter either email or mobile number" };
    }

    if (normalizedEmail && (!normalizedEmail.includes("@") || !normalizedEmail.includes("."))) {
        return { status: 400, error: "Enter a valid email address" };
    }

    if (normalizedMobile && normalizedMobile.replace(/\D/g, "").length < 10) {
        return { status: 400, error: "Enter a valid mobile number" };
    }

    if (age !== null && (!Number.isFinite(age) || age < 10 || age > 100)) {
        return { status: 400, error: "Age must be between 10 and 100" };
    }

    if (requesterId === String(user._id) && (roleInfo.role !== "superadmin" || !isActive)) {
        return { status: 400, error: "You cannot remove or disable your own super admin access" };
    }

    if (user.role === "superadmin" && roleInfo.role !== "superadmin") {
        const otherSuperAdmins = await User.countDocuments({
            role: "superadmin",
            _id: { $ne: user._id },
        });
        if (otherSuperAdmins === 0) {
            return { status: 400, error: "At least one super admin account must remain" };
        }
    }

    const storedEmail = normalizedEmail || `${normalizedUsername}@mobile.local`;
    const existingUser = await User.findOne({
        _id: { $ne: user._id },
        $or: [
            { username: normalizedUsername },
            { email: storedEmail },
            ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
            ...(normalizedMobile ? [{ mobile: normalizedMobile }] : []),
        ],
    });
    if (existingUser) {
        return { status: 400, error: "Username, email, or mobile number already exists" };
    }

    user.name = name;
    user.username = normalizedUsername;
    user.email = storedEmail;
    user.mobile = normalizedMobile || undefined;
    user.role = roleInfo.role;
    user.customRole = roleInfo.customRole || "";
    user.isActive = isActive;
    user.age = age;
    user.gender = payload.gender || "";
    user.project = String(payload.project || "").trim();
    user.designation = String(payload.designation || "").trim();

    await user.save();
    return { user };
}

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
        adminPermissions: normalizeAdminPermissions(user),
    };
}

// ── REGISTER ──────────────────────────────────────────────────
router.post("/register", async (req, res) => {
    try {
        const result = await createUserFromPayload({ ...req.body, role: "candidate" }, { allowAdmin: false });
        if (result.error) return res.status(result.status).json({ message: result.error });
        const token = jwt.sign(
            { id: result.user._id, role: result.user.role },
            process.env.JWT_SECRET || "snehalaya2024",
            { expiresIn: "1d" }
        );
        res.json({
            message: "User Registered Successfully",
            token,
            user: publicUser(result.user),
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── SUPER ADMIN USER CREATION ────────────────────────────────
router.post("/superadmin/users", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const result = await createUserFromPayload(req.body, { allowAdmin: true });
        if (result.error) return res.status(result.status).json({ message: result.error });
        res.status(201).json(publicUser(result.user));
    } catch (err) {
        res.status(500).json({ message: "Error creating user" });
    }
});

// ── SUPER ADMIN USER EDIT ────────────────────────────────────
router.put("/superadmin/users/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const result = await updateUserFromPayload(req.params.id, req.body, req.user.id);
        if (result.error) return res.status(result.status).json({ message: result.error });
        res.json(publicUser(result.user));
    } catch (err) {
        res.status(500).json({ message: "Error updating user" });
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
        ).select("_id name username email mobile role customRole isActive age gender project designation adminPermissions");

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
        ).select("_id name username email mobile role customRole isActive age gender project designation adminPermissions");

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

// ── DELETE USER ACCOUNT ──────────────────────────────────────
router.delete("/superadmin/users/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        if (req.user.id === req.params.id) {
            return res.status(400).json({ message: "You cannot delete your own account" });
        }

        const user = await User.findById(req.params.id).select("_id name role");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (user.role === "superadmin") {
            const otherSuperAdmins = await User.countDocuments({
                role: "superadmin",
                _id: { $ne: user._id },
            });
            if (otherSuperAdmins === 0) {
                return res.status(400).json({ message: "At least one super admin account must remain" });
            }
        }

        await User.findByIdAndDelete(user._id);
        res.json({
            message: "User deleted successfully",
            deletedUserId: user._id,
        });
    } catch (err) {
        res.status(500).json({ message: "Error deleting user" });
    }
});

// ── ADMIN USER LIST FOR MAIL / ASSIGNMENT ─────────────────────
router.get("/users", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
    try {
        const requester = await User.findById(req.user.id).select("role adminPermissions");
        if (requester?.role === "admin" &&
            !hasAdminPermission(requester, "canViewUsers") &&
            !hasAdminPermission(requester, "canAssignTests") &&
            !hasAdminPermission(requester, "canBulkMail")) {
            return res.status(403).json({ message: "User list access denied" });
        }
        const users = await User.find().select("_id name username email mobile role customRole isActive project designation adminPermissions").sort({ name: 1 });
        const scopedUsers = requester?.role === "admin"
            ? users.filter(user => matchesUserScope(requester, user))
            : users;
        res.json(scopedUsers.map(publicUser));
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
            disabled: role.disabled,
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
        const disabled = Boolean(req.body.disabled);

        if (!name) return res.status(400).json({ message: "Role name is required" });
        if (systemRoles.some(role => role.name.toLowerCase() === name.toLowerCase())) {
            return res.status(400).json({ message: "This system role already exists" });
        }

        const role = await RoleDefinition.create({ name, baseRole, description, disabled });
        res.status(201).json(role);
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Role already exists" });
        res.status(500).json({ message: "Error creating role" });
    }
});

router.put("/superadmin/roles/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const baseRole = req.body.baseRole === "admin" ? "admin" : "candidate";
        const description = String(req.body.description || "").trim();
        const disabled = Boolean(req.body.disabled);

        if (!name) return res.status(400).json({ message: "Role name is required" });
        if (systemRoles.some(role => role.name.toLowerCase() === name.toLowerCase())) {
            return res.status(400).json({ message: "System roles cannot be edited" });
        }

        const roleQuery = req.params.id.match(/^[a-f\d]{24}$/i)
            ? { $or: [{ _id: req.params.id }, { name: req.params.id }] }
            : { name: req.params.id };
        const role = await RoleDefinition.findOneAndUpdate(
            roleQuery,
            { name, baseRole, description, disabled },
            { new: true }
        );
        if (!role) return res.status(404).json({ message: "Role not found" });
        res.json({
            _id: role._id,
            name: role.name,
            baseRole: role.baseRole,
            description: role.description,
            disabled: role.disabled,
            system: false,
        });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Role already exists" });
        res.status(500).json({ message: "Error updating role" });
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
        ).select("_id name username email mobile role customRole isActive age gender project designation adminPermissions");

        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(publicUser(user));
    } catch (err) {
        res.status(500).json({ message: "Error updating user role" });
    }
});

router.put("/superadmin/users/:id/permissions", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const permissions = Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
            acc[key] = req.body.permissions?.[key] === undefined
                ? ADMIN_PERMISSION_DEFAULTS[key]
                : Boolean(req.body.permissions[key]);
            return acc;
        }, {});
        const scopeProjects = Array.isArray(req.body.scopeProjects)
            ? [...new Set(req.body.scopeProjects.map(item => String(item || "").trim()).filter(Boolean))]
            : [];
        const scopeDepartments = Array.isArray(req.body.scopeDepartments)
            ? [...new Set(req.body.scopeDepartments.map(item => String(item || "").trim()).filter(Boolean))]
            : [];

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { adminPermissions: { permissions, scopeProjects, scopeDepartments } },
            { new: true }
        ).select("_id name username email mobile role customRole isActive age gender project designation adminPermissions");

        if (!user) return res.status(404).json({ message: "User not found" });
        if (!["admin", "superadmin"].includes(user.role)) {
            return res.status(400).json({ message: "Rights can only be saved for admins" });
        }
        res.json(publicUser(user));
    } catch (err) {
        res.status(500).json({ message: "Error updating user rights" });
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

router.put("/superadmin/org-options/projects/:name", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const currentName = String(req.params.name || "").trim();
        const nextName = String(req.body.name || "").trim();
        if (!currentName || !nextName) {
            return res.status(400).json({ message: "Current and new project names are required" });
        }

        const doc = await getOrgOptionsDoc();
        const project = doc.projects.find(item => item.name.toLowerCase() === currentName.toLowerCase());
        if (!project) return res.status(404).json({ message: "Project/department not found" });

        const duplicate = doc.projects.some(item =>
            item.name.toLowerCase() === nextName.toLowerCase() &&
            item.name.toLowerCase() !== currentName.toLowerCase()
        );
        if (duplicate) return res.status(409).json({ message: "Project/department already exists" });

        project.name = nextName;
        await doc.save();
        res.json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error updating project" });
    }
});

router.delete("/superadmin/org-options/projects/:name", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const projectName = String(req.params.name || "").trim();
        if (!projectName) return res.status(400).json({ message: "Project name is required" });

        const doc = await getOrgOptionsDoc();
        const projectIndex = doc.projects.findIndex(item => item.name.toLowerCase() === projectName.toLowerCase());
        if (projectIndex === -1) return res.status(404).json({ message: "Project/department not found" });

        doc.projects.splice(projectIndex, 1);
        await doc.save();
        res.json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error deleting project" });
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

router.delete("/superadmin/org-options/departments", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const projectName = String(req.body.project || req.query.project || "").trim();
        const department = String(req.body.department || req.query.department || "").trim();
        if (!projectName || !department) {
            return res.status(400).json({ message: "Project and designation are required" });
        }

        const doc = await getOrgOptionsDoc();
        const project = doc.projects.find(item => item.name.toLowerCase() === projectName.toLowerCase());
        if (!project) return res.status(404).json({ message: "Project/department not found" });

        const departmentIndex = project.departments.findIndex(item => item.toLowerCase() === department.toLowerCase());
        if (departmentIndex === -1) return res.status(404).json({ message: "Designation not found" });

        project.departments.splice(departmentIndex, 1);
        await doc.save();
        res.json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error deleting designation" });
    }
});

router.put("/superadmin/org-options/departments", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const projectName = String(req.body.project || "").trim();
        const currentDepartment = String(req.body.oldDepartment || "").trim();
        const nextDepartment = String(req.body.department || "").trim();
        if (!projectName || !currentDepartment || !nextDepartment) {
            return res.status(400).json({ message: "Project, current designation, and new designation are required" });
        }

        const doc = await getOrgOptionsDoc();
        const project = doc.projects.find(item => item.name.toLowerCase() === projectName.toLowerCase());
        if (!project) return res.status(404).json({ message: "Project/department not found" });

        const departmentIndex = project.departments.findIndex(item => item.toLowerCase() === currentDepartment.toLowerCase());
        if (departmentIndex === -1) return res.status(404).json({ message: "Designation not found" });

        const duplicate = project.departments.some(item =>
            item.toLowerCase() === nextDepartment.toLowerCase() &&
            item.toLowerCase() !== currentDepartment.toLowerCase()
        );
        if (duplicate) return res.status(409).json({ message: "Designation already exists in this project/department" });

        project.departments.set(departmentIndex, nextDepartment);
        await doc.save();
        res.json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error updating designation" });
    }
});

module.exports = router;
