const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    // 1. Get the raw header
    const authHeader = req.header("Authorization");

    // 2. Check if header exists and starts with "Bearer "
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
            message: "Access Denied"
        });
    }

    // 3. Strip "Bearer " to get just the token string
    const token = authHeader.split(" ")[1];

    try {
        /**
         * 4. Verify using your Environment Variable. 
         * IMPORTANT: Ensure "JWT_SECRET" is set in Railway Variables.
         * Defaulting to "secretkey" for safety, but process.env is best practice.
         */
        const secret = process.env.JWT_SECRET || "secretkey";
        const verified = jwt.verify(token, secret);

        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({
            message: "Invalid Token"
        });
    }
};

module.exports = authMiddleware;