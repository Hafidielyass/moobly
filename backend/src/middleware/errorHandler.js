/**
 * middleware/errorHandler.js — Centralized Express error handler
 */

const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error(`${err.message} | ${req.method} ${req.originalUrl}`, {
    stack: err.stack,
    user: req.user?.id,
  });

  // Mongoose: duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ error: `${field} already exists.` });
  }

  // Mongoose: validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: messages.join(". ") });
  }

  // Mongoose: bad ObjectId
  if (err.name === "CastError") {
    return res.status(400).json({ error: `Invalid ID: ${err.value}` });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ error: "Invalid token." });
  }
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ error: "Token expired." });
  }

  // Multer file size error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res
      .status(413)
      .json({ error: "File too large. Maximum size is 20MB." });
  }

  // Known app errors with statusCode
  const status = err.statusCode || err.status || 500;
  const message = err.isOperational
    ? err.message
    : process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message;

  res.status(status).json({ error: message });
};

// ─── Operational error helper ──────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
