/**
 * models/Profile.js — User's professional profile (from CSV)
 */

const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, default: "" },
    location: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    github: { type: String, default: "" },
    portfolio: { type: String, default: "" },
    summary: { type: String, default: "" },
    title: { type: String, default: "" }, // "Senior Backend Developer"

    // ─── Experience ────────────────────────────────────────────
    experience: [
      {
        company: String,
        role: String,
        startDate: String,
        endDate: String,
        description: String,
        technologies: [String],
      },
    ],

    // ─── Education ─────────────────────────────────────────────
    education: [
      {
        institution: String,
        degree: String,
        field: String,
        startYear: String,
        endYear: String,
        gpa: String,
      },
    ],

    // ─── Skills ────────────────────────────────────────────────
    skills: [{ type: String }],
    languages: [
      {
        name: String,
        level: {
          type: String,
          enum: ["basic", "intermediate", "advanced", "native"],
        },
      },
    ],
    certifications: [{ name: String, issuer: String, year: String }],

    // ─── Source CSV ────────────────────────────────────────────
    sourceCsvPath: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    label: { type: String, default: "Default Profile" },
  },
  { timestamps: true },
);

profileSchema.index({ user: 1 });

module.exports = mongoose.model("Profile", profileSchema);
