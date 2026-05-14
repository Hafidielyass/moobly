// routes/webhooks.js — n8n callback endpoints
const router = require("express").Router();
const Job = require("../models/Job");
const Application = require("../models/Application");
const logger = require("../utils/logger");

// POST /api/webhooks/scrape-results — Called by n8n after scraping
router.post("/scrape-results", async (req, res) => {
  try {
    const { userId, jobs = [], stats = {} } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });

    let saved = 0;
    let duplicates = 0;

    for (const jobData of jobs) {
      try {
        const existing = await Job.findOne({
          apply_url: jobData.apply_url,
          user: userId,
        });
        if (existing) {
          duplicates++;
          continue;
        }
        await Job.create({ ...jobData, user: userId });
        saved++;
      } catch (e) {
        if (e.code === 11000) duplicates++;
        else logger.error(`[Webhook] Save error: ${e.message}`);
      }
    }

    logger.info(
      `[Webhook] scrape-results: saved=${saved}, dupes=${duplicates} for user ${userId}`,
    );
    res.json({ saved, duplicates });
  } catch (err) {
    logger.error(`[Webhook] Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/application-result — Called by n8n after applying
router.post("/application-result", async (req, res) => {
  try {
    const { applicationId, status, error, executionId } = req.body;

    await Application.findByIdAndUpdate(applicationId, {
      status: status || "failed",
      error: error || null,
      n8nExecutionId: executionId || null,
      ...(status === "applied" ? { appliedAt: new Date() } : {}),
    });

    logger.info(`[Webhook] Application ${applicationId} → ${status}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/cv-ready — Called by n8n after CV generation
router.post("/cv-ready", async (req, res) => {
  try {
    const { cvId, pdfUrl, status, error } = req.body;
    const CV = require("../models/CV");
    await CV.findByIdAndUpdate(cvId, { pdfUrl, status, error });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
