const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Access Denied" });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Use the EXACT Railway variable name: snehalaya2024 (via process.env)
        // If process.env.JWT_SECRET is missing, it falls back to the string
       const verified = jwt.verify(token, process.env.JWT_SECRET || "snehalaya2024");
        req.user = verified;
        next();
    } catch (err) {
        res.status(401).json({ message: "Invalid Token" });
    }
};

module.exports = authMiddleware;