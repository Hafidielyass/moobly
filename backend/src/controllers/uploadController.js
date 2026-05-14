/**
 * controllers/uploadController.js — Handle CSV + LaTeX template uploads
 */

const path = require("path");
const fs = require("fs");
const multer = require("multer");
const Profile = require("../models/Profile");
const csvParser = require("../utils/csvParser");
const logger = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");

// ─── Multer configuration ──────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "..", "uploads", req.user._id.toString());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = {
    csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
    tex: ["text/plain", "application/x-tex", "application/octet-stream"],
    pdf: ["application/pdf"],
  };
  const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
  const validTypes = allowed[ext] || [];

  if (["csv", "tex"].includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError(`Invalid file type: ${ext}`, 400));
  }
};

exports.upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ─── POST /api/upload/profile — Upload + parse CSV ─────────────────
exports.uploadProfile = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);

    const filePath = req.file.path;
    const profileData = await csvParser.parseProfileCsv(filePath);

    // Save or update profile
    const label =
      req.body.label || `Profile ${new Date().toLocaleDateString()}`;

    const profile = await Profile.findOneAndUpdate(
      { user: req.user._id, label },
      {
        user: req.user._id,
        label,
        sourceCsvPath: filePath,
        ...profileData,
      },
      { upsert: true, new: true, runValidators: true },
    );

    logger.info(`Profile uploaded for user ${req.user.email}`);
    res.status(201).json({ profile, message: "Profile created from CSV." });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/upload/template — Upload LaTeX template ────────────
exports.uploadTemplate = async (req, res, next) => {
  try {
    if (!req.file) throw new AppError("No file uploaded", 400);

    const templatePath = req.file.path;
    const templateName =
      req.body.name || path.basename(req.file.originalname, ".tex");

    logger.info(
      `LaTeX template uploaded: ${templateName} by ${req.user.email}`,
    );

    res.status(201).json({
      message: "LaTeX template uploaded.",
      template: {
        name: templateName,
        path: templatePath,
        filename: req.file.filename,
        size: req.file.size,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/upload/templates — List user's templates ────────────
exports.listTemplates = async (req, res, next) => {
  try {
    const dir = path.join(__dirname, "..", "uploads", req.user._id.toString());
    if (!fs.existsSync(dir)) return res.json({ templates: [] });

    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".tex"))
      .map((f) => ({
        filename: f,
        path: path.join(dir, f),
        url: `/uploads/${req.user._id}/${f}`,
        size: fs.statSync(path.join(dir, f)).size,
        createdAt: fs.statSync(path.join(dir, f)).birthtime,
      }));

    res.json({ templates: files });
  } catch (err) {
    next(err);
  }
};
