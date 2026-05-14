/**
 * models/Job.js — Scraped job listings
 */

const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    // ─── Core job data ─────────────────────────────────────────
    title: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "Remote" },
    description: { type: String, default: "" },
    requirements: { type: String, default: "" },
    salary: { type: String, default: "Not specified" },
    job_type: {
      type: String,
      enum: [
        "full-time",
        "part-time",
        "contract",
        "internship",
        "remote",
        "hybrid",
        "unknown",
      ],
      default: "unknown",
    },
    posted_date: { type: Date, default: null },
    apply_url: { type: String, required: true },
    apply_method: {
      type: String,
      enum: ["email", "website"],
      default: "website",
    },
    contact_email: { type: String, default: null },

    // ─── Source metadata ───────────────────────────────────────
    platform: {
      type: String,
      enum: ["indeed", "rekrute", "linkedin", "manual"],
      required: true,
    },
    platform_job_id: { type: String, default: null }, // original ID on source platform
    scraped_at: { type: Date, default: Date.now },

    // ─── Owner (multi-user) ────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ─── Enrichment ────────────────────────────────────────────
    keywords: [{ type: String }], // extracted keywords for CV matching
    category: { type: String, default: null }, // e.g. "Software Engineering"
    experience_level: {
      type: String,
      enum: ["junior", "mid", "senior", "lead", "any", "unknown"],
      default: "unknown",
    },

    // ─── Status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "new",
        "saved",
        "applying",
        "applied",
        "failed",
        "rejected",
        "interview",
      ],
      default: "new",
    },

    isSaved: { type: Boolean, default: false },
    isDuplicate: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// ─── Indexes for fast queries ──────────────────────────────────────
jobSchema.index({ user: 1, status: 1 });
jobSchema.index({ user: 1, platform: 1 });
jobSchema.index({ user: 1, createdAt: -1 });
jobSchema.index({ apply_url: 1, user: 1 }, { unique: true, sparse: true });
jobSchema.index(
  { title: "text", company: "text", description: "text" },
  { weights: { title: 3, company: 2, description: 1 } },
);

// ─── Virtual: age ──────────────────────────────────────────────────
jobSchema.virtual("ageInDays").get(function () {
  if (!this.posted_date) return null;
  return Math.floor((Date.now() - this.posted_date) / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model("Job", jobSchema);
