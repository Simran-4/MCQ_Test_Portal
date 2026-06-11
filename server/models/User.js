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
        // ─────────────────────────────────────────────────
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
