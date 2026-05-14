/**
 * controllers/jobController.js — Job listings CRUD + scrape trigger
 */

const axios = require("axios");
const Job = require("../models/Job");
const Application = require("../models/Application");
const logger = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");

// ─── GET /api/jobs — List with filters + pagination ────────────────
exports.getJobs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      platform,
      location,
      title,
      job_type,
      search,
      dateFrom,
      dateTo,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = { user: req.user._id };

    if (status) query.status = status;
    if (platform) query.platform = platform;
    if (job_type) query.job_type = job_type;
    if (location) query.location = { $regex: location, $options: "i" };
    if (title) query.title = { $regex: title, $options: "i" };

    if (dateFrom || dateTo) {
      query.posted_date = {};
      if (dateFrom) query.posted_date.$gte = new Date(dateFrom);
      if (dateTo) query.posted_date.$lte = new Date(dateTo);
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const sortObj = { [sortBy]: order === "asc" ? 1 : -1 };

    const [jobs, total] = await Promise.all([
      Job.find(query).sort(sortObj).skip(skip).limit(Number(limit)).lean(),
      Job.countDocuments(query),
    ]);

    res.json({
      jobs,
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

// ─── GET /api/jobs/:id ─────────────────────────────────────────────
exports.getJob = async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, user: req.user._id });
    if (!job) throw new AppError("Job not found", 404);

    // Attach application info if exists
    const application = await Application.findOne({
      job: job._id,
      user: req.user._id,
    }).select("status attempts lastAttemptAt appliedAt error");

    res.json({ job, application });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/jobs/:id — Update status/save ─────────────────────
exports.updateJob = async (req, res, next) => {
  try {
    const allowed = ["status", "isSaved", "notes"];
    const updates = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });

    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updates },
      { new: true },
    );
    if (!job) throw new AppError("Job not found", 404);
    res.json({ job });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/jobs/:id ──────────────────────────────────────────
exports.deleteJob = async (req, res, next) => {
  try {
    const job = await Job.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!job) throw new AppError("Job not found", 404);
    res.json({ message: "Job deleted." });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/jobs/scrape — Trigger n8n scraping workflow ─────────
exports.triggerScrape = async (req, res, next) => {
  try {
    const {
      platforms = ["indeed", "rekrute"],
      title,
      location,
      dateRange,
      maxResults = 50,
    } = req.body;

    if (!title) {
      return res
        .status(400)
        .json({ error: "Job title / keyword is required." });
    }

    const payload = {
      userId: req.user._id.toString(),
      filters: { platforms, title, location, dateRange, maxResults },
      webhook_callback: `${process.env.BACKEND_URL || "http://localhost:5000"}/api/webhooks/scrape-results`,
    };

    logger.info(
      `Scrape triggered by ${req.user.email} | filters: ${JSON.stringify(payload.filters)}`,
    );

    // Fire and return immediately (async via n8n)
    axios
      .post(process.env.N8N_SCRAPE_WEBHOOK, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      })
      .catch((err) => {
        logger.error(`n8n scrape webhook error: ${err.message}`);
      });

    res.json({
      message: "Scraping job queued. Results will appear shortly.",
      filters: payload.filters,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/jobs/stats — Quick stats for current user ────────────
exports.getStats = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [totalJobs, byPlatform, byStatus] = await Promise.all([
      Job.countDocuments({ user: userId }),
      Job.aggregate([
        { $match: { user: userId } },
        { $group: { _id: "$platform", count: { $sum: 1 } } },
      ]),
      Job.aggregate([
        { $match: { user: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    res.json({ totalJobs, byPlatform, byStatus });
  } catch (err) {
    next(err);
  }
};
