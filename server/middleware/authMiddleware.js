const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("Auth Failed: No Bearer Token");
        return res.status(401).json({ message: "Access Denied" });
    }

    const token = authHeader.split(" ")[1];

    try {
        // We use the Railway variable first, then the hardcoded fallback
        const secret = process.env.JWT_SECRET || "snehalaya2024";
        const verified = jwt.verify(token, secret);
        req.user = verified;
        next();
    } catch (err) {
        console.log("JWT Error:", err.message);
        res.status(401).json({ message: "Invalid Token" });
    }
};

module.exports = authMiddleware;