/**
 * controllers/analyticsController.js — Dashboard analytics
 */

const Job = require("../models/Job");
const Application = require("../models/Application");
const CV = require("../models/CV");

// ─── GET /api/analytics/dashboard ─────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [
      jobStats,
      appStats,
      platformBreakdown,
      timeline,
      recentApps,
      failedApps,
    ] = await Promise.all([
      // Job counts
      Job.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            saved: { $sum: { $cond: ["$isSaved", 1, 0] } },
          },
        },
      ]),

      // Application status counts
      Application.aggregate([
        { $match: { user: userId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),

      // Jobs per platform
      Job.aggregate([
        { $match: { user: userId } },
        { $group: { _id: "$platform", jobs: { $sum: 1 } } },
        { $sort: { jobs: -1 } },
      ]),

      // Application timeline (last 30 days)
      Application.aggregate([
        {
          $match: {
            user: userId,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            applications: { $sum: 1 },
            applied: {
              $sum: { $cond: [{ $eq: ["$status", "applied"] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Recent applications
      Application.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("job", "title company platform"),

      // Failed applications
      Application.find({ user: userId, status: "failed" })
        .sort({ updatedAt: -1 })
        .limit(5)
        .populate("job", "title company platform apply_url"),
    ]);

    // Build summary
    const jobSummary = jobStats[0] || { total: 0, saved: 0 };

    const appSummary = {
      total: 0,
      pending: 0,
      applied: 0,
      failed: 0,
      interview: 0,
    };
    appStats.forEach(({ _id, count }) => {
      appSummary[_id] = count;
      appSummary.total += count;
    });
    appSummary.conversionRate =
      appSummary.total > 0
        ? +((appSummary.applied / appSummary.total) * 100).toFixed(1)
        : 0;

    res.json({
      jobs: jobSummary,
      applications: appSummary,
      platformBreakdown,
      timeline,
      recentApplications: recentApps,
      failedApplications: failedApps,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/analytics/timeline?days=30 ──────────────────────────
exports.getTimeline = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const userId = req.user._id;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [jobs, applications] = await Promise.all([
      Job.aggregate([
        { $match: { user: userId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Application.aggregate([
        { $match: { user: userId, createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            total: { $sum: 1 },
            applied: {
              $sum: { $cond: [{ $eq: ["$status", "applied"] }, 1, 0] },
            },
            failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({ jobs, applications });
  } catch (err) {
    next(err);
  }
};
