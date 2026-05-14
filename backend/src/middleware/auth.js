/**
 * middleware/auth.js — JWT authentication + role-based access control
 */

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

/**
 * protect — Requires valid JWT in Authorization header
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ error: "Not authorized. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ error: "User not found. Token invalid." });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account deactivated." });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.warn(`JWT verification failed: ${err.message}`);

    if (err.name === "TokenExpiredError") {
      return res
        .status(401)
        .json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
};

/**
 * authorize(...roles) — Restricts route to specified roles
 * Usage: router.get('/admin', protect, authorize('admin'), handler)
 */
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        error: `Role '${req.user?.role}' is not authorized for this action.`,
      });
    }
    next();
  };

/**
 * optionalAuth — Populates req.user if token is present (no error if absent)
 */
const optionalAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return next();

  try {
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
  } catch (_) {
    // silently ignore
  }
  next();
};

/**
 * generateToken — Creates signed JWT for a user
 */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

module.exports = { protect, authorize, optionalAuth, generateToken };
