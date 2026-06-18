const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        username: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true,
        },
        mobile: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            // Normalizing to lowercase to match authRoutes logic
            enum: ["candidate", "admin", "superadmin"],
            default: "candidate",
        },
        customRole: {
            type: String,
            trim: true,
            default: "",
        },
        isActive: {
            type: Boolean,
            default: true,
        },

        // ── NEW FIELDS ────────────────────────────────────
        age: {
            type: Number,
            default: null,
        },
        gender: {
            type: String,
            // Allowing empty string for optional/default cases
            enum: ["Male", "Female", "Other", ""],
            default: "",
        },
        project: {
            type: String,
            trim: true,
            default: "",
        },
        designation: {
            type: String,
            trim: true,
            default: "",
        },
        adminPermissions: {
            permissions: {
                canViewReports:     { type: Boolean, default: true },
                canDownloadReports: { type: Boolean, default: true },
                canViewSuites:      { type: Boolean, default: true },
                canManageSuites:    { type: Boolean, default: true },
                canViewQuestions:   { type: Boolean, default: true },
                canManageQuestions: { type: Boolean, default: true },
                canAssignTests:     { type: Boolean, default: true },
                canManageSettings:  { type: Boolean, default: true },
                canBulkMail:        { type: Boolean, default: true },
                canViewUsers:       { type: Boolean, default: true },
            },
            scopeProjects:    { type: [String], default: [] },
            scopeDepartments: { type: [String], default: [] },
        },
        // ─────────────────────────────────────────────────
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
