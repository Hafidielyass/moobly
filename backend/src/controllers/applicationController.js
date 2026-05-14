/**
 * controllers/applicationController.js
 */

const axios = require("axios");
const Application = require("../models/Application");
const Job = require("../models/Job");
const CV = require("../models/CV");
const applicationQueue = require("../services/queue/applicationQueue");
const logger = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");

// ─── GET /api/applications ─────────────────────────────────────────
exports.getApplications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, platform } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    let pipeline = [
      { $match: query },
      {
        $lookup: {
          from: "jobs",
          localField: "job",
          foreignField: "_id",
          as: "job",
        },
      },
      { $unwind: { path: "$job", preserveNullAndEmpty: false } },
    ];

    if (platform) {
      pipeline.push({ $match: { "job.platform": platform } });
    }

    const [results, countResult] = await Promise.all([
      Application.aggregate([
        ...pipeline,
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
      ]),
      Application.aggregate([...pipeline, { $count: "total" }]),
    ]);

    const total = countResult[0]?.total || 0;

    res.json({
      applications: results,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/applications/:id ─────────────────────────────────────
exports.getApplication = async (req, res, next) => {
  try {
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user._id,
    })
      .populate("job")
      .populate("cv");
    if (!app) throw new AppError("Application not found", 404);
    res.json({ application: app });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/applications — Submit application ───────────────────
exports.createApplication = async (req, res, next) => {
  try {
    const { jobId, cvId, coverLetter, mode = "auto" } = req.body;

    const job = await Job.findOne({ _id: jobId, user: req.user._id });
    if (!job) throw new AppError("Job not found", 404);

    // Prevent duplicate
    const existing = await Application.findOne({
      job: jobId,
      user: req.user._id,
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: "Already applied to this job.", application: existing });
    }

    const application = await Application.create({
      user: req.user._id,
      job: jobId,
      cv: cvId || null,
      applyMethod: job.apply_method,
      coverLetter: coverLetter || null,
      status: mode === "manual" ? "manual_required" : "pending",
    });

    // Update job status
    await Job.findByIdAndUpdate(jobId, { status: "applying" });

    // Queue for processing unless manual
    if (mode !== "manual") {
      await applicationQueue.add(
        "process-application",
        {
          applicationId: application._id.toString(),
          userId: req.user._id.toString(),
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          delay: 1000,
        },
      );
    }

    logger.info(`Application created: ${application._id} for job ${job.title}`);
    res.status(201).json({ application });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/applications/:id/retry ─────────────────────────────
exports.retryApplication = async (req, res, next) => {
  try {
    const app = await Application.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!app) throw new AppError("Application not found", 404);

    if (!app.canRetry) {
      return res.status(400).json({
        error: `Cannot retry. Status: ${app.status}, Attempts: ${app.attempts}/${app.maxAttempts}`,
      });
    }

    app.status = "pending";
    app.error = null;
    await app.save();

    await applicationQueue.add(
      "process-application",
      { applicationId: app._id.toString(), userId: req.user._id.toString() },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    logger.info(`Application retry queued: ${app._id}`);
    res.json({ message: "Application queued for retry.", application: app });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/applications/:id — Update notes/status (manual) ───
exports.updateApplication = async (req, res, next) => {
  try {
    const allowed = ["status", "notes", "coverLetter"];
    const updates = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const app = await Application.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updates },
      { new: true },
    ).populate("job");
    if (!app) throw new AppError("Application not found", 404);
    res.json({ application: app });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/applications/summary ────────────────────────────────
exports.getSummary = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const stats = await Application.aggregate([
      { $match: { user: userId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const summary = {
      total: 0,
      pending: 0,
      applied: 0,
      failed: 0,
      interview: 0,
      rejected: 0,
      manual_required: 0,
    };

    stats.forEach(({ _id, count }) => {
      summary[_id] = count;
      summary.total += count;
    });

    summary.successRate =
      summary.total > 0
        ? ((summary.applied / summary.total) * 100).toFixed(1)
        : 0;

    res.json({ summary });
  } catch (err) {
    next(err);
  }
};
