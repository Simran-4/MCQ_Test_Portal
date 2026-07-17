const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const dns = require("dns").promises;
const { getPool } = require("./db/postgres");
const User = require("./models/User");
const Result = require("./models/Result");
const RoleDefinition = require("./models/RoleDefinition");
const AdminRightDefinition = require("./models/AdminRightDefinition");
const OrgOption = require("./models/OrgOption");
const ActivityLog = require("./models/ActivityLog");
const PasswordResetOtp = require("./models/PasswordResetOtp");
const authMiddleware = require("./middleware/authMiddleware");
const {
    OTP_EXPIRY_MINUTES,
    OTP_RESEND_COOLDOWN_SECONDS,
    OTP_MAX_ATTEMPTS,
    createOtp,
    hashOtp,
    otpMatches,
    sendWhatsAppOtp,
} = require("./utils/passwordResetOtp");
const { sendCertificateEmail } = require("./utils/certificateMailer");
const {
    ADMIN_PERMISSION_DEFAULTS,
    normalizeAdminPermissions,
    hasAdminPermission,
    matchesUserScope,
} = require("./utils/adminPermissions");
const {
    builtInRightDefinitions,
    customRightDefinition,
    isBuiltInRightKey,
    isCustomRightKey,
    labelFromCustomRightKey,
    normalizeCustomRightInput,
} = require("./utils/adminRightDefinitions");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DNS_CHECK_TIMEOUT_MS = 3500;

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
const ADMIN_RIGHTS_LOCK_NAME = "mcq-test-portal:admin-rights";

function routeError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function withAdminRightsTransaction(work) {
    const client = await getPool().connect();
    try {
        await client.query("BEGIN");
        await client.query(
            "SELECT pg_advisory_xact_lock(hashtext($1))",
            [ADMIN_RIGHTS_LOCK_NAME]
        );
        const result = await work(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

function documentFromRow(row) {
    return row ? { ...row.data, _id: row.id } : null;
}

async function persistedCustomRightKeys(client) {
    const { rows } = await client.query(
        `SELECT data->>'key' AS key
         FROM app_documents
         WHERE collection = 'AdminRightDefinition'`
    );
    return rows
        .map(row => String(row.key || ""))
        .filter(key => isCustomRightKey(key) && !isBuiltInRightKey(key));
}

async function legacyCustomRightKeys(client) {
    const { rows } = await client.query(
        `SELECT DISTINCT permission.key
         FROM app_documents AS users
         CROSS JOIN LATERAL jsonb_object_keys(
           COALESCE(users.data #> '{adminPermissions,permissions}', '{}'::jsonb)
         ) AS permission(key)
         WHERE users.collection = 'User'`
    );
    return rows
        .map(row => String(row.key || ""))
        .filter(isCustomRightKey);
}

function rawPermissionValues(user) {
    const raw = user?.adminPermissions?.permissions;
    if (raw instanceof Map) return Object.fromEntries(raw);
    return raw && typeof raw === "object" ? { ...raw } : {};
}

async function customRightKeysFromUsers() {
    const users = await User.find().select("adminPermissions");
    return new Set(users.flatMap(user =>
        Object.keys(rawPermissionValues(user)).filter(isCustomRightKey)
    ));
}

async function listAdminRightDefinitions() {
    const [storedDefinitions, legacyKeys] = await Promise.all([
        AdminRightDefinition.find().sort({ label: 1 }),
        customRightKeysFromUsers(),
    ]);
    const storedByKey = new Map();
    storedDefinitions.forEach(right => {
        const key = String(right.key || "");
        if (!isCustomRightKey(key) || isBuiltInRightKey(key)) return;
        storedByKey.set(key, customRightDefinition(right));
    });

    legacyKeys.forEach(key => {
        if (!storedByKey.has(key)) {
            storedByKey.set(key, customRightDefinition({
                key,
                label: labelFromCustomRightKey(key),
                detail: "Legacy custom right",
            }, { legacy: true }));
        }
    });

    return [
        ...builtInRightDefinitions(),
        ...[...storedByKey.values()].sort((left, right) =>
            left.label.localeCompare(right.label)
        ),
    ];
}

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

    if (normalizedEmail) {
        const emailCheck = await verifyDeliverableEmail(normalizedEmail);
        if (!emailCheck.valid) return { status: 400, error: emailCheck.message };
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
    const currentUsername = normalizeUsername(user.username || user.name);
    const currentEmail = isSyntheticMobileEmail(user.email) ? "" : normalizeEmail(user.email);
    const currentMobile = normalizeMobile(user.mobile);
    const usernameChanged = normalizedUsername !== currentUsername;
    const emailChanged = normalizedEmail !== currentEmail;
    const mobileChanged = normalizedMobile !== currentMobile;
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

    if (normalizedEmail && emailChanged) {
        const emailCheck = await verifyDeliverableEmail(normalizedEmail);
        if (!emailCheck.valid) return { status: 400, error: emailCheck.message };
    }

    if (normalizedMobile && normalizedMobile.replace(/\D/g, "").length < 10) {
        return { status: 400, error: "Enter a valid mobile number" };
    }

    if (age !== null && (!Number.isFinite(age) || age < 10 || age > 100)) {
        return { status: 400, error: "Age must be between 10 and 100" };
    }

    const newPassword = payload.password === undefined ? "" : String(payload.password);
    if (newPassword && newPassword.length < 6) {
        return { status: 400, error: "Password must be at least 6 characters" };
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
    const changedIdentityChecks = [
        ...(usernameChanged ? [{ username: normalizedUsername }] : []),
        ...(emailChanged && normalizedEmail ? [{ email: normalizedEmail }] : []),
        ...(mobileChanged && normalizedMobile ? [{ mobile: normalizedMobile }] : []),
    ];
    if (changedIdentityChecks.length) {
        const existingUser = await User.findOne({
            _id: { $ne: user._id },
            $or: changedIdentityChecks,
        });
        if (existingUser) {
            return { status: 400, error: "The updated username, email, or mobile number is already used by another account" };
        }
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
    if (newPassword) {
        user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    return { user };
}

const ORG_OPTIONS_DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
let defaultOrgProjectsPromise;

async function getDefaultOrgProjects() {
    if (!defaultOrgProjectsPromise) {
        defaultOrgProjectsPromise = import("./data/projectDepartments.mjs")
            .then(({ PROJECT_DEPARTMENTS }) => Object.entries(PROJECT_DEPARTMENTS).map(([name, departments]) => ({
                name,
                departments: [...departments],
            })))
            .catch(err => {
                defaultOrgProjectsPromise = null;
                throw err;
            });
    }
    return defaultOrgProjectsPromise;
}

function normalizeOrgProjects(projects) {
    const normalizedProjects = [];
    const projectIndexes = new Map();

    (Array.isArray(projects) ? projects : []).forEach(project => {
        const name = String(project?.name || "").trim();
        if (!name) return;
        const departments = Array.isArray(project.departments)
            ? project.departments.map(item => String(item || "").trim()).filter(Boolean)
            : [];
        const projectKey = name.toLowerCase();
        const existingIndex = projectIndexes.get(projectKey);

        if (existingIndex === undefined) {
            projectIndexes.set(projectKey, normalizedProjects.length);
            normalizedProjects.push({ name, departments: [] });
        }

        const targetIndex = projectIndexes.get(projectKey);
        const existingProject = normalizedProjects[targetIndex];
        const departmentNames = new Set(existingProject.departments.map(item => item.toLowerCase()));
        departments.forEach(department => {
            if (!departmentNames.has(department.toLowerCase())) {
                existingProject.departments.push(department);
                departmentNames.add(department.toLowerCase());
            }
        });
    });

    return normalizedProjects;
}

function mergeOrgProjects(defaultProjects, storedProjects) {
    return normalizeOrgProjects([
        ...defaultProjects,
        ...(Array.isArray(storedProjects) ? storedProjects : []),
    ]);
}

function storedProjectsAreAuthoritative(defaultProjects, storedProjects) {
    const defaultNames = new Set(defaultProjects.map(project => project.name.toLowerCase()));
    const storedNames = new Set(
        normalizeOrgProjects(storedProjects).map(project => project.name.toLowerCase())
    );
    const matchingDefaultProjects = [...storedNames].filter(name => defaultNames.has(name)).length;

    // A broad imported snapshot may already contain intentional renames/deletions.
    // Sparse legacy records only contained additions layered over client defaults.
    return matchingDefaultProjects >= Math.ceil(defaultNames.size / 2);
}

async function getOrgOptionsDoc() {
    const defaultProjects = await getDefaultOrgProjects();
    let doc = await OrgOption.findById(ORG_OPTIONS_DOCUMENT_ID);
    if (!doc) doc = await OrgOption.findOne({ key: "default" });

    if (!doc) {
        return OrgOption.create({
            _id: ORG_OPTIONS_DOCUMENT_ID,
            key: "default",
            projects: normalizeOrgProjects(defaultProjects),
            defaultsSeeded: true,
        });
    }

    if (!doc.defaultsSeeded) {
        const storedProjects = normalizeOrgProjects(doc.projects);
        doc.projects = storedProjectsAreAuthoritative(defaultProjects, storedProjects)
            ? storedProjects
            : mergeOrgProjects(defaultProjects, storedProjects);
        doc.defaultsSeeded = true;
        delete doc.$setOnInsert;
        await doc.save();
    }

    return doc;
}

async function resolveOrgSelection(projectName, designationName) {
    const requestedProject = String(projectName || "").trim();
    const requestedDesignation = String(designationName || "").trim();
    if (!requestedProject || !requestedDesignation) {
        return { error: "Select a project/department and designation" };
    }

    const doc = await getOrgOptionsDoc();
    const project = doc.projects.find(
        item => item.name.toLowerCase() === requestedProject.toLowerCase()
    );
    if (!project) return { error: "Selected project/department is no longer available" };

    const designation = project.departments.find(
        item => item.toLowerCase() === requestedDesignation.toLowerCase()
    );
    if (!designation) return { error: "Selected designation is no longer available" };

    return { project: project.name, designation };
}

async function migrateDesignationReferences(projectName, currentDepartment, nextDepartment) {
    const projectKey = projectName.toLowerCase();
    const currentKey = currentDepartment.toLowerCase();
    const nextKey = nextDepartment.toLowerCase();
    const users = await User.find();

    await Promise.all(users.map(async user => {
        let changed = false;
        if (
            String(user.project || "").toLowerCase() === projectKey &&
            String(user.designation || "").toLowerCase() === currentKey
        ) {
            user.designation = nextDepartment;
            changed = true;
        }

        const rawPermissions = user.adminPermissions;
        const scopeProjects = Array.isArray(rawPermissions?.scopeProjects)
            ? rawPermissions.scopeProjects
            : [];
        const scopeDepartments = Array.isArray(rawPermissions?.scopeDepartments)
            ? rawPermissions.scopeDepartments
            : [];
        const scopeCoversProject = scopeProjects.length === 0 ||
            scopeProjects.some(item => String(item || "").toLowerCase() === projectKey);
        const includesCurrentDepartment = scopeDepartments.some(
            item => String(item || "").toLowerCase() === currentKey
        );

        if (scopeCoversProject && includesCurrentDepartment) {
            const nextScopeDepartments = currentKey === nextKey
                ? scopeDepartments.map(item =>
                    String(item || "").toLowerCase() === currentKey ? nextDepartment : item
                )
                : [
                    ...scopeDepartments,
                    ...(scopeDepartments.some(item => String(item || "").toLowerCase() === nextKey)
                        ? []
                        : [nextDepartment]),
                ];
            user.adminPermissions = {
                ...rawPermissions,
                scopeDepartments: nextScopeDepartments,
            };
            changed = true;
        }

        if (changed) await user.save();
    }));
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

function basicEmailValidation(email) {
    const normalized = normalizeEmail(email);
    if (!normalized) return { valid: false, message: "Enter an email address" };
    if (!EMAIL_RE.test(normalized)) return { valid: false, message: "Enter a valid email address" };
    const domain = normalized.split("@").pop();
    if (!domain || domain.includes("..")) return { valid: false, message: "Enter a valid email address" };
    return { valid: true, email: normalized, domain };
}

function withTimeout(promise, timeoutMs) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => {
            const err = new Error("Email validation timed out");
            err.code = "ETIMEOUT";
            reject(err);
        }, timeoutMs)),
    ]);
}

async function verifyDeliverableEmail(email) {
    const basic = basicEmailValidation(email);
    if (!basic.valid) return basic;
    try {
        const mxRecords = await withTimeout(dns.resolveMx(basic.domain), DNS_CHECK_TIMEOUT_MS);
        if (Array.isArray(mxRecords) && mxRecords.length > 0) {
            return { valid: true, email: basic.email };
        }
    } catch (err) {
        if (!["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT"].includes(err.code)) {
            return { valid: true, email: basic.email };
        }
    }

    try {
        const addresses = await withTimeout(dns.resolve4(basic.domain), DNS_CHECK_TIMEOUT_MS);
        if (Array.isArray(addresses) && addresses.length > 0) {
            return { valid: true, email: basic.email };
        }
    } catch (err) {
        if (!["ENODATA", "ENOTFOUND", "ESERVFAIL", "ETIMEOUT"].includes(err.code)) {
            return { valid: true, email: basic.email };
        }
    }

    return { valid: false, message: "Email domain could not be verified. Enter a working email address." };
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
router.post("/validate-email", async (req, res) => {
    try {
        const result = await verifyDeliverableEmail(req.body.email);
        if (!result.valid) {
            return res.status(400).json({ valid: false, message: result.message });
        }
        res.json({ valid: true, message: "Email looks valid." });
    } catch (err) {
        res.status(500).json({ valid: false, message: "Unable to verify email right now." });
    }
});

router.post("/register", async (req, res) => {
    try {
        const orgSelection = await resolveOrgSelection(req.body.project, req.body.designation);
        if (orgSelection.error) return res.status(400).json({ message: orgSelection.error });
        const result = await createUserFromPayload(
            { ...req.body, ...orgSelection, role: "candidate" },
            { allowAdmin: false }
        );
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
        const orgSelection = await resolveOrgSelection(req.body.project, req.body.designation);
        if (orgSelection.error) return res.status(400).json({ message: orgSelection.error });
        const result = await createUserFromPayload(
            { ...req.body, ...orgSelection },
            { allowAdmin: true }
        );
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
        if (rawIdentifier.includes("@")) {
            const basicEmail = basicEmailValidation(normalizedIdentifier);
            if (!basicEmail.valid) {
                return res.status(400).json({ message: basicEmail.message });
            }
        }
        const normalizedUsername = normalizeUsername(rawIdentifier);
        const normalizedMobile = normalizeMobile(rawIdentifier);

        const matchingUsers = await User.find({
            $or: [
                { email: normalizedIdentifier },
                { username: normalizedUsername },
                { mobile: normalizedMobile },
            ],
        });
        if (matchingUsers.length === 0) {
            return res.status(400).json({ message: "User not found" });
        }

        const passwordMatches = await Promise.all(matchingUsers.map(async user => {
            try {
                return await bcrypt.compare(password, user.password);
            } catch {
                return false;
            }
        }));
        const user = matchingUsers.find((candidate, index) => passwordMatches[index]);
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        if (user.isActive === false) {
            return res.status(403).json({ message: "Your account has been disabled" });
        }

      const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "snehalaya2024", // Read from the CloudJiffy environment
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

// ── CURRENT USER ───────────────────────────────────────────────
// The certificate is rendered in the browser so it matches the preview and
// download. This endpoint sends that generated PDF as an email attachment.
router.post("/certificates/email", authMiddleware, requireAdminOrSuperAdmin, async (req, res) => {
    try {
        const requester = req.currentUser;
        if (!hasAdminPermission(requester, "canBulkMail")) {
            return res.status(403).json({ message: "Certificate email permission is disabled for your account." });
        }

        const resultId = String(req.body?.resultId || "").trim();
        const language = req.body?.language === "marathi" ? "marathi" : "english";
        const suppliedFileName = String(req.body?.fileName || "").trim();
        const pdfBase64 = String(req.body?.pdfBase64 || "").trim();
        if (!resultId || !pdfBase64 || !suppliedFileName) {
            return res.status(400).json({ message: "Certificate PDF and result details are required." });
        }
        if (pdfBase64.length > 7 * 1024 * 1024) {
            return res.status(413).json({ message: "Certificate PDF is too large to email." });
        }

        const result = await Result.findById(resultId);
        if (!result) return res.status(404).json({ message: "Result not found." });
        if (!result.passed) return res.status(400).json({ message: "A certificate can be emailed only for a passed candidate." });
        if (!matchesUserScope(requester, result)) {
            return res.status(403).json({ message: "You do not have access to this candidate result." });
        }

        const recipient = normalizeEmail(result.CandidateEmail || result.userEmail);
        if (!EMAIL_RE.test(recipient)) return res.status(400).json({ message: "Candidate email is not available." });
        const pdf = Buffer.from(pdfBase64, "base64");
        if (pdf.length === 0 || pdf.length > 5 * 1024 * 1024 || pdf.subarray(0, 5).toString() !== "%PDF-") {
            return res.status(400).json({ message: "The generated certificate is not a valid PDF." });
        }

        const safeFileName = suppliedFileName
            .replace(/[^a-zA-Z0-9._-]/g, "_")
            .replace(/^_+/, "")
            .slice(0, 176) || "certificate";
        const fileName = safeFileName.toLowerCase().endsWith(".pdf")
            ? safeFileName
            : safeFileName + ".pdf";
        const candidateName = String(result.CandidateName || result.userName || "Candidate").trim();
        const testName = String(result.testName || "Assessment").trim();
        const subject = "Certificate - " + testName + " (" + (language === "marathi" ? "Marathi" : "English") + ")";
        const text = language === "marathi"
            ? "Dear " + candidateName + ",\n\nYour " + testName + " certificate PDF is attached.\n\nRegards,\nSnehalaya"
            : "Dear " + candidateName + ",\n\nCongratulations on successfully completing " + testName + ". Your certificate PDF is attached.\n\nRegards,\nSnehalaya";
        await sendCertificateEmail({ to: recipient, subject, text, fileName, pdf });
        res.json({ message: "Certificate PDF emailed successfully." });
    } catch (err) {
        console.error("Certificate email failed:", err.code || err.message);
        if (err.code === "SMTP_NOT_CONFIGURED") {
            return res.status(503).json({ message: "Certificate email is not configured yet. Please contact IT support." });
        }
        res.status(502).json({ message: "Unable to send the certificate email. Please try again." });
    }
});

router.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = req.currentUser || await User.findById(req.user.id).select(
            "_id name username email mobile role customRole isActive age gender project designation adminPermissions"
        );
        if (!user || user.isActive === false) {
            return res.status(401).json({ message: "Account inactive or not found" });
        }
        res.json(publicUser(user));
    } catch (err) {
        res.status(500).json({ message: "Unable to load current user" });
    }
});

// ── FORGOT PASSWORD REQUEST ───────────────────────────────────
router.post("/forgot-password", async (req, res) => {
    try {
        const rawIdentifier = String(req.body.identifier || req.body.email || "").trim();
        if (!rawIdentifier) {
            return res.status(400).json({ message: "Username, email, or mobile number is required" });
        }

        const user = await User.findOne({
            $or: [
                { email: normalizeEmail(rawIdentifier) },
                { username: normalizeUsername(rawIdentifier) },
                { mobile: normalizeMobile(rawIdentifier) },
            ],
        });
        const genericMessage = "If an active account matches these details, a WhatsApp OTP has been sent to its registered mobile number.";
        if (!user || user.isActive === false) {
            return res.json({ message: genericMessage, otpRequired: true });
        }
        if (!normalizeMobile(user.mobile)) {
            return res.status(400).json({ message: "This account does not have a registered WhatsApp mobile number. Please contact IT support." });
        }

        const now = new Date();
        let resetOtp = await PasswordResetOtp.findOne({ userId: String(user._id) });
        const lastSent = new Date(resetOtp?.lastSentAt || 0).getTime();
        const elapsedSeconds = Math.floor((now.getTime() - lastSent) / 1000);
        if (resetOtp && elapsedSeconds >= 0 && elapsedSeconds < OTP_RESEND_COOLDOWN_SECONDS) {
            return res.json({
                message: "An OTP was sent recently. Please check WhatsApp before requesting another one.",
                otpRequired: true,
                retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds,
            });
        }

        const otp = createOtp();
        await sendWhatsAppOtp({ mobile: user.mobile, otp });
        if (!resetOtp) resetOtp = new PasswordResetOtp({ userId: String(user._id) });
        resetOtp.otpHash = hashOtp(otp);
        resetOtp.expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
        resetOtp.attempts = 0;
        resetOtp.lastSentAt = now.toISOString();
        resetOtp.usedAt = "";
        await resetOtp.save();
        res.json({
            message: genericMessage,
            otpRequired: true,
        });
    } catch (err) {
        console.error("WhatsApp password reset request failed:", err.code || err.message, err.detail || "");
        const message = err.code === "WHATSAPP_NOT_CONFIGURED"
            ? "WhatsApp OTP is not configured yet. Please contact IT support."
            : "Unable to send the WhatsApp OTP right now. Please try again shortly.";
        res.status(503).json({ message });
    }
});

router.post("/forgot-password/verify-otp", async (req, res) => {
    try {
        const rawIdentifier = String(req.body.identifier || "").trim();
        const otp = String(req.body.otp || "").replace(/\s/g, "");
        if (!rawIdentifier || !/^\d{6}$/.test(otp)) {
            return res.status(400).json({ message: "Enter the six-digit OTP from WhatsApp." });
        }
        const user = await User.findOne({
            $or: [
                { email: normalizeEmail(rawIdentifier) },
                { username: normalizeUsername(rawIdentifier) },
                { mobile: normalizeMobile(rawIdentifier) },
            ],
        });
        const resetOtp = user && await PasswordResetOtp.findOne({ userId: String(user._id) });
        const isExpired = !resetOtp || new Date(resetOtp.expiresAt || 0).getTime() <= Date.now();
        if (!user || user.isActive === false || isExpired || resetOtp.usedAt || resetOtp.attempts >= OTP_MAX_ATTEMPTS) {
            return res.status(400).json({ message: "This OTP is invalid or has expired. Request a new OTP and try again." });
        }
        if (!otpMatches(otp, resetOtp.otpHash)) {
            resetOtp.attempts += 1;
            await resetOtp.save();
            return res.status(400).json({ message: "This OTP is invalid or has expired. Request a new OTP and try again." });
        }

        const resetToken = jwt.sign(
            { id: user._id, passwordResetOtpId: resetOtp._id, purpose: "password-reset" },
            process.env.JWT_SECRET || "snehalaya2024",
            { expiresIn: "10m" }
        );
        res.json({ message: "OTP verified. Choose your new password.", resetToken });
    } catch (err) {
        res.status(500).json({ message: "Unable to verify the OTP" });
    }
});

router.post("/forgot-password/reset", async (req, res) => {
    try {
        const password = String(req.body.password || "");
        const resetToken = String(req.body.resetToken || "");
        if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
        if (!resetToken) return res.status(400).json({ message: "Your reset session has expired. Request a new OTP." });

        let payload;
        try {
            payload = jwt.verify(resetToken, process.env.JWT_SECRET || "snehalaya2024");
        } catch {
            return res.status(400).json({ message: "Your reset session has expired. Request a new OTP." });
        }
        if (payload.purpose !== "password-reset" || !payload.id || !payload.passwordResetOtpId) {
            return res.status(400).json({ message: "Your reset session has expired. Request a new OTP." });
        }
        const [user, resetOtp] = await Promise.all([
            User.findById(payload.id),
            PasswordResetOtp.findById(payload.passwordResetOtpId),
        ]);
        if (!user || user.isActive === false || !resetOtp || String(resetOtp.userId) !== String(user._id)
            || resetOtp.usedAt || new Date(resetOtp.expiresAt || 0).getTime() <= Date.now()) {
            return res.status(400).json({ message: "Your reset session has expired. Request a new OTP." });
        }
        user.password = await bcrypt.hash(password, 10);
        resetOtp.usedAt = new Date().toISOString();
        await Promise.all([user.save(), resetOtp.save()]);
        res.json({ message: "Your password has been reset. You can now log in." });
    } catch (err) {
        res.status(500).json({ message: "Unable to reset the password" });
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

router.get("/superadmin/activity-logs", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const { search, from, to, tzOffsetMinutes } = req.query;
        const logs = await ActivityLog.find().sort({ occurredAt: -1, createdAt: -1 });
        const searchTerm = String(search || "").trim().toLowerCase();
        const offsetCandidate = Number(tzOffsetMinutes);
        const timezoneOffsetMinutes = Number.isFinite(offsetCandidate) && offsetCandidate >= -840 && offsetCandidate <= 840
            ? offsetCandidate
            : -330;
        const parseDateBoundary = (value, endOfDay = false) => {
            if (!value) return null;
            const matched = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!matched) return NaN;
            const [, year, month, day] = matched.map(Number);
            const timestamp = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
            const check = new Date(timestamp);
            if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return NaN;
            return timestamp + timezoneOffsetMinutes * 60 * 1000;
        };
        const fromTime = parseDateBoundary(from);
        const toTime = parseDateBoundary(to, true);
        if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
            return res.status(400).json({ message: "Enter valid From and To dates." });
        }
        if (fromTime !== null && toTime !== null && fromTime > toTime) {
            return res.status(400).json({ message: "The From date cannot be after the To date." });
        }
        const filtered = logs.filter(log => {
            const occurred = new Date(log.occurredAt || log.createdAt || 0).getTime();
            if (fromTime !== null && occurred < fromTime) return false;
            if (toTime !== null && occurred > toTime) return false;
            if (!searchTerm) return true;
            const flattenDetails = value => {
                if (value === null || value === undefined) return "";
                if (Array.isArray(value)) return value.map(flattenDetails).join(" ");
                if (typeof value === "object") return Object.values(value).map(flattenDetails).join(" ");
                return String(value);
            };
            const haystack = [
                log.actorName,
                log.actorRole,
                log.action,
                log.method,
                log.path,
                log.targetId,
                log.details?.username,
                log.details?.project,
                log.details?.designation,
                log.details?.department,
                log.details?.name,
                log.details?.email,
                flattenDetails(log.details),
            ].join(" ").toLowerCase();
            return haystack.includes(searchTerm);
        });
        res.json(filtered.slice(0, 500));
    } catch (err) {
        res.status(500).json({ message: "Unable to load activity logs" });
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
        );

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
        const password = String(req.body?.password || "");

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.password = await bcrypt.hash(password, 10);
        await user.save();

        const savedUser = await User.findById(req.params.id);
        if (!savedUser || !(await bcrypt.compare(password, savedUser.password))) {
            throw new Error("Password verification failed after saving");
        }

        res.json({
            message: "Password reset successfully",
            user: publicUser(savedUser),
        });

    } catch (err) {
        console.error("Super Admin password reset failed:", err);
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
            !hasAdminPermission(requester, "canBulkMail") &&
            !hasAdminPermission(requester, "canViewReports") &&
            !hasAdminPermission(requester, "canViewTestReports")) {
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
router.get("/superadmin/rights", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        res.json(await listAdminRightDefinitions());
    } catch (err) {
        res.status(500).json({ message: "Error fetching user rights" });
    }
});

router.post("/superadmin/rights", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const rightInput = normalizeCustomRightInput(req.body);
        const duplicateBuiltIn = builtInRightDefinitions().some(right =>
            String(right.key).toLowerCase() === rightInput.key.toLowerCase() ||
            String(right.label).toLowerCase() === rightInput.label.toLowerCase()
        );
        if (duplicateBuiltIn) {
            return res.status(409).json({ message: "This right already exists." });
        }

        const created = await withAdminRightsTransaction(async client => {
            const [duplicateDefinition, legacyDefinition] = await Promise.all([
                client.query(
                    `SELECT 1
                     FROM app_documents
                     WHERE collection = 'AdminRightDefinition'
                       AND (
                         LOWER(COALESCE(data->>'key', '')) = LOWER($1)
                         OR LOWER(COALESCE(data->>'label', '')) = LOWER($2)
                       )
                     LIMIT 1`,
                    [rightInput.key, rightInput.label]
                ),
                client.query(
                    `SELECT 1
                     FROM app_documents
                     WHERE collection = 'User'
                       AND COALESCE(
                         data #> '{adminPermissions,permissions}',
                         '{}'::jsonb
                       ) ? $1
                     LIMIT 1`,
                    [rightInput.key]
                ),
            ]);
            if (duplicateDefinition.rowCount > 0 || legacyDefinition.rowCount > 0) {
                throw routeError("This right already exists.", 409);
            }

            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const data = {
                ...rightInput,
                createdBy: req.user.id,
                createdAt: now,
                updatedAt: now,
            };
            await client.query(
                `INSERT INTO app_documents (collection, id, data, created_at, updated_at)
                 VALUES ('AdminRightDefinition', $1, $2::jsonb, $3, $3)`,
                [id, JSON.stringify(data), now]
            );
            return customRightDefinition({ _id: id, ...data });
        });
        res.status(201).json(created);
    } catch (err) {
        res.status(err.statusCode || 500).json({
            message: err.statusCode ? err.message : "Error creating user right",
        });
    }
});

router.delete("/superadmin/rights/:identifier", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const identifier = String(req.params.identifier || "").trim();
        if (!identifier) {
            return res.status(400).json({ message: "Select a custom right to delete." });
        }
        if (isBuiltInRightKey(identifier)) {
            return res.status(400).json({ message: "Built-in rights cannot be deleted." });
        }

        const result = await withAdminRightsTransaction(async client => {
            const definitionResult = await client.query(
                `SELECT id, data
                 FROM app_documents
                 WHERE collection = 'AdminRightDefinition'
                   AND (id::text = $1 OR data->>'key' = $1)
                 ORDER BY CASE WHEN id::text = $1 THEN 0 ELSE 1 END
                 LIMIT 1`,
                [identifier]
            );
            const definition = documentFromRow(definitionResult.rows[0]);
            const key = String(definition?.key || identifier);
            if (isBuiltInRightKey(key)) {
                throw routeError("Built-in rights cannot be deleted.", 400);
            }
            if (!isCustomRightKey(key)) {
                throw routeError("Custom right not found.", 404);
            }

            const now = new Date().toISOString();
            const affected = await client.query(
                `UPDATE app_documents
                 SET data = jsonb_set(
                       data,
                       '{adminPermissions,permissions}',
                       COALESCE(
                         data #> '{adminPermissions,permissions}',
                         '{}'::jsonb
                       ) - $1::text,
                       true
                     ) || jsonb_build_object('updatedAt', $2::text),
                     updated_at = $2::timestamptz
                 WHERE collection = 'User'
                   AND COALESCE(
                     data #> '{adminPermissions,permissions}',
                     '{}'::jsonb
                   ) ? $1`,
                [key, now]
            );

            let deletedDefinitionCount = 0;
            if (definition) {
                const deleted = await client.query(
                    `DELETE FROM app_documents
                     WHERE collection = 'AdminRightDefinition'
                       AND data->>'key' = $1`,
                    [key]
                );
                deletedDefinitionCount = deleted.rowCount;
            } else if (affected.rowCount === 0) {
                throw routeError("Custom right not found.", 404);
            }

            return {
                message: "Custom right deleted successfully.",
                deletedRight: {
                    _id: definition?._id || "",
                    key,
                    label: definition?.label || labelFromCustomRightKey(key),
                },
                affectedUsers: affected.rowCount,
                deletedDefinitionCount,
            };
        });
        res.json(result);
    } catch (err) {
        res.status(err.statusCode || 500).json({
            message: err.statusCode ? err.message : "Error deleting user right",
        });
    }
});

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

router.delete("/superadmin/roles/:id", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const identifier = String(req.params.id || "").trim();
        if (!identifier) return res.status(400).json({ message: "Role is required" });
        if (systemRoles.some(role => role.name.toLowerCase() === identifier.toLowerCase())) {
            return res.status(400).json({ message: "System roles cannot be deleted" });
        }

        let role = await RoleDefinition.findById(identifier);
        if (!role) role = await RoleDefinition.findOne({ name: identifier });
        if (!role) return res.status(404).json({ message: "Role not found" });
        if (systemRoles.some(item => item.name.toLowerCase() === String(role.name || "").toLowerCase())) {
            return res.status(400).json({ message: "System roles cannot be deleted" });
        }

        const assignedCount = await User.countDocuments({ customRole: role.name });
        if (assignedCount > 0) {
            return res.status(409).json({
                message: `Reassign ${assignedCount} user${assignedCount === 1 ? "" : "s"} before deleting this role.`,
                assignedCount,
            });
        }

        await RoleDefinition.findByIdAndDelete(role._id);
        res.json({
            message: "Role deleted successfully",
            deletedRole: { _id: role._id, name: role.name },
        });
    } catch (err) {
        res.status(500).json({ message: "Error deleting role" });
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
        );

        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(publicUser(user));
    } catch (err) {
        res.status(500).json({ message: "Error updating user role" });
    }
});

router.put("/superadmin/users/:id/permissions", authMiddleware, requireSuperAdmin, async (req, res) => {
    try {
        const updatedUser = await withAdminRightsTransaction(async client => {
            const targetResult = await client.query(
                `SELECT id, data
                 FROM app_documents
                 WHERE collection = 'User' AND id::text = $1
                 FOR UPDATE`,
                [String(req.params.id || "")]
            );
            const targetUser = documentFromRow(targetResult.rows[0]);
            if (!targetUser) throw routeError("User not found", 404);
            if (targetUser.role !== "admin") {
                throw routeError(
                    targetUser.role === "superadmin"
                        ? "Super admin rights cannot be restricted."
                        : "Rights can only be saved for admins.",
                    400
                );
            }

            const allowedCustomKeys = new Set([
                ...await persistedCustomRightKeys(client),
                ...await legacyCustomRightKeys(client),
            ]);
            const currentAccess = normalizeAdminPermissions(targetUser);
            const rawPermissions = Object.keys(ADMIN_PERMISSION_DEFAULTS).reduce((acc, key) => {
                acc[key] = req.body.permissions?.[key] === undefined
                    ? currentAccess.permissions[key]
                    : Boolean(req.body.permissions[key]);
                return acc;
            }, {});
            allowedCustomKeys.forEach(key => {
                if (Object.prototype.hasOwnProperty.call(currentAccess.permissions, key)) {
                    rawPermissions[key] = Boolean(currentAccess.permissions[key]);
                }
            });
            Object.entries(req.body.permissions || {}).forEach(([key, value]) => {
                if (allowedCustomKeys.has(key)) {
                    rawPermissions[key] = Boolean(value);
                }
            });
            const permissions = normalizeAdminPermissions({ permissions: rawPermissions }).permissions;
            const scopeProjects = Array.isArray(req.body.scopeProjects)
                ? [...new Set(req.body.scopeProjects.map(item => String(item || "").trim()).filter(Boolean))]
                : currentAccess.scopeProjects;
            const scopeDepartments = Array.isArray(req.body.scopeDepartments)
                ? [...new Set(req.body.scopeDepartments.map(item => String(item || "").trim()).filter(Boolean))]
                : currentAccess.scopeDepartments;
            const adminPermissions = { permissions, scopeProjects, scopeDepartments };
            const now = new Date().toISOString();
            const updateResult = await client.query(
                `UPDATE app_documents
                 SET data = data || jsonb_build_object(
                       'adminPermissions', $2::jsonb,
                       'updatedAt', $3::text
                     ),
                     updated_at = $3::timestamptz
                 WHERE collection = 'User' AND id = $1
                 RETURNING id, data`,
                [targetUser._id, JSON.stringify(adminPermissions), now]
            );
            return publicUser(documentFromRow(updateResult.rows[0]));
        });
        res.json(updatedUser);
    } catch (err) {
        res.status(err.statusCode || 500).json({
            message: err.statusCode ? err.message : "Error updating user rights",
        });
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

        project.departments.splice(departmentIndex, 1, nextDepartment);
        await doc.save();
        await migrateDesignationReferences(project.name, currentDepartment, nextDepartment);
        res.json(doc.projects);
    } catch (err) {
        res.status(500).json({ message: "Error updating designation" });
    }
});

module.exports = router;
