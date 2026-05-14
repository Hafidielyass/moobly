/**
 * models/Application.js — Job application tracking
 */

const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    cv: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CV",
      default: null,
    },
    profile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      default: null,
    },

    // ─── Application status ────────────────────────────────────
    status: {
      type: String,
      enum: [
        "pending", // queued, not yet attempted
        "in_progress", // currently being submitted
        "applied", // successfully submitted
        "failed", // submission failed
        "rejected", // employer rejected
        "interview", // interview scheduled
        "manual_required", // needs human review
      ],
      default: "pending",
    },

    // ─── Attempt tracking ──────────────────────────────────────
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    lastAttemptAt: { type: Date, default: null },
    appliedAt: { type: Date, default: null },

    // ─── Method used ───────────────────────────────────────────
    applyMethod: {
      type: String,
      enum: ["email", "website", "manual"],
      required: true,
    },

    // ─── Error tracking ────────────────────────────────────────
    error: { type: String, default: null },
    errorStack: { type: String, default: null, select: false },

    // ─── Email details (if applyMethod = email) ────────────────
    emailDetails: {
      to: { type: String, default: null },
      subject: { type: String, default: null },
      body: { type: String, default: null },
      sentAt: { type: Date, default: null },
      messageId: { type: String, default: null },
    },

    // ─── Cover letter ──────────────────────────────────────────
    coverLetter: { type: String, default: null },

    // ─── Notification tracking ─────────────────────────────────
    notificationSent: { type: Boolean, default: false },
    notificationSentAt: { type: Date, default: null },

    // ─── n8n execution ID ──────────────────────────────────────
    n8nExecutionId: { type: String, default: null },

    notes: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

// ─── Indexes ───────────────────────────────────────────────────────
applicationSchema.index({ user: 1, status: 1 });
applicationSchema.index({ user: 1, createdAt: -1 });
applicationSchema.index({ job: 1, user: 1 }, { unique: true });

// ─── Virtual: canRetry ────────────────────────────────────────────
applicationSchema.virtual("canRetry").get(function () {
  return this.status === "failed" && this.attempts < this.maxAttempts;
});

module.exports = mongoose.model("Application", applicationSchema);
