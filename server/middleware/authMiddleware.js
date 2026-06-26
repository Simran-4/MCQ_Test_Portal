const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("Auth Failed: No Bearer Token");
        return res.status(401).json({ message: "Access Denied" });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Validate the configured JWT secret
        const secret = process.env.JWT_SECRET || "snehalaya2024";
        const verified = jwt.verify(token, secret);
        const user = await User.findById(verified.id).select(
            "_id name username email mobile role customRole isActive age gender project designation adminPermissions"
        );

        if (!user || user.isActive === false) {
            return res.status(401).json({ message: "Account inactive or not found" });
        }

        req.currentUser = user;
        req.user = {
            ...verified,
            id: String(user._id),
            role: user.role,
            customRole: user.customRole || "",
            adminPermissions: user.adminPermissions,
        };
        next();
    } catch (err) {
        console.log("JWT Error:", err.message);
        res.status(401).json({ message: "Invalid Token" });
    }
};

module.exports = authMiddleware;
