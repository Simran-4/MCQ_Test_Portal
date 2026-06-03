const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    role: {
        type: String,
        enum: ["Candidate", "admin", "superadmin"],
        default: "Candidate"
    },
    isActive: {
        type: Boolean,
        default: true
    }
});

module.exports = mongoose.model("User", userSchema);