/**
 * server.js — Mobly Backend Entry Point
 * Express + MongoDB + Bull Queue server
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");

// ─── Route imports ─────────────────────────────────────────────────
const authRoutes = require("./routes/auth");
const jobRoutes = require("./routes/jobs");
const applicationRoutes = require("./routes/applications");
const analyticsRoutes = require("./routes/analytics");
const uploadRoutes = require("./routes/upload");
const cvRoutes = require("./routes/cv");
const webhookRoutes = require("./routes/webhooks");
const profileRoutes = require("./routes/profiles");

// ─── Queue workers (auto-start) ────────────────────────────────────
require("./services/queue/workers");

const app = express();

// ─── Connect Database ──────────────────────────────────────────────
connectDB();

// ─── Security middleware ───────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Rate limiting ─────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", limiter);

// ─── Body parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ─── Logging ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.http(msg.trim()) },
    }),
  );
}

// ─── Static file serving (uploads / CVs) ──────────────────────────
const uploadsDir = path.resolve(
  __dirname,
  "..",
  process.env.UPLOADS_DIR || "uploads",
);
const cvOutputDir = path.resolve(
  __dirname,
  "..",
  process.env.CV_OUTPUT_DIR || "generated-cvs",
);
app.use("/uploads", express.static(uploadsDir));
app.use("/generated-cvs", express.static(cvOutputDir));

// ─── Health check ─────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: require("../package.json").version,
    env: process.env.NODE_ENV,
  });
});

// ─── API Routes ────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/cv", cvRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/profiles", profileRoutes);

// ─── 404 handler ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ─── Global error handler ──────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  logger.info(`🚀 Mobly API running on port ${PORT} [${process.env.NODE_ENV}]`);
});

// ─── Graceful shutdown ─────────────────────────────────────────────
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  server.close(() => process.exit(0));
});

module.exports = app;
