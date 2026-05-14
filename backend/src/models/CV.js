/**
 * models/CV.js — Generated CV documents
 */

const mongoose = require("mongoose");

const cvSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      default: null, // null = generic CV
    },

    // ─── File paths ────────────────────────────────────────────
    latexSource: { type: String, default: null }, // .tex file path
    pdfPath: { type: String, default: null }, // .pdf file path
    pdfUrl: { type: String, default: null }, // public URL

    // ─── Template used ─────────────────────────────────────────
    templateName: { type: String, default: "default" },
    templatePath: { type: String, default: null },

    // ─── Tailoring metadata ────────────────────────────────────
    injectedKeywords: [{ type: String }],
    tailoredSummary: { type: String, default: null },
    jobTitle: { type: String, default: null }, // job title it was tailored for
    companyName: { type: String, default: null },

    // ─── Generation status ─────────────────────────────────────
    status: {
      type: String,
      enum: ["generating", "ready", "failed"],
      default: "generating",
    },
    error: { type: String, default: null },

    label: { type: String, default: null }, // human-readable label
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

cvSchema.index({ user: 1, createdAt: -1 });
cvSchema.index({ user: 1, job: 1 });

module.exports = mongoose.model("CV", cvSchema);
