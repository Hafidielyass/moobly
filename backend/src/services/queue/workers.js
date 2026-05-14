/**
 * services/queue/workers.js — Bull queue workers (process applications)
 */

const applicationQueue = require("./applicationQueue");
const Application = require("../../models/Application");
const Job = require("../../models/Job");
const User = require("../../models/User");
const { sendApplicationEmail } = require("../application/emailApplicant");
const { sendWhatsAppMessage } = require("../notification/whatsapp");
const logger = require("../../utils/logger");

const CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY) || 2;

// ─── Application processor ─────────────────────────────────────────
applicationQueue.process("process-application", CONCURRENCY, async (job) => {
  const { applicationId, userId } = job.data;

  logger.info(`[Worker] Processing application ${applicationId}`);

  const application = await Application.findById(applicationId).populate("job");
  if (!application) {
    logger.warn(`[Worker] Application ${applicationId} not found`);
    return;
  }

  // Mark in progress
  application.status = "in_progress";
  application.attempts += 1;
  application.lastAttemptAt = new Date();
  await application.save();

  try {
    if (application.applyMethod === "email") {
      await sendApplicationEmail(applicationId);
      logger.info(`[Worker] Email application success: ${applicationId}`);
    } else if (application.applyMethod === "website") {
      // Website applications: mark as manual_required if no automation
      const user = await User.findById(userId);
      if (!user?.preferences?.autoApply) {
        application.status = "manual_required";
        await application.save();

        // Notify user
        if (user?.preferences?.whatsappNotifications && user?.whatsappNumber) {
          await sendWhatsAppMessage(user.whatsappNumber, "manual_review", {
            jobTitle: application.job?.title,
            company: application.job?.company,
            actionLink: `${process.env.FRONTEND_URL}/applications/${applicationId}`,
          }).catch(() => {});
        }
        return;
      }
      // TODO: Web automation via Playwright (requires per-site implementation)
      // For now, mark as manual_required
      application.status = "manual_required";
      await application.save();
    }
  } catch (err) {
    logger.error(
      `[Worker] Application ${applicationId} failed: ${err.message}`,
    );

    application.status =
      application.attempts >= application.maxAttempts ? "failed" : "pending";
    application.error = err.message;
    await application.save();

    // Update job status
    if (application.status === "failed") {
      await Job.findByIdAndUpdate(application.job._id, { status: "failed" });

      // Send failure notification
      const user = await User.findById(userId);
      if (user?.preferences?.whatsappNotifications && user?.whatsappNumber) {
        await sendWhatsAppMessage(user.whatsappNumber, "application_failed", {
          jobTitle: application.job?.title,
          company: application.job?.company,
          errorReason: err.message,
          retryUrl: `${process.env.FRONTEND_URL}/applications/${applicationId}`,
        }).catch(() => {});
      }
    }

    throw err; // Let Bull handle retries
  }
});

// ─── Scraping queue ────────────────────────────────────────────────
const Bull = require("bull");
const scraperQueue = new Bull("scraper", {
  redis: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: parseInt(process.env.REDIS_PORT),
  },
});

const { runScrape } = require("../scraper/scraperManager");

scraperQueue.process("run-scrape", 1, async (job) => {
  const { userId, filters } = job.data;
  logger.info(`[ScraperWorker] Starting scrape for user ${userId}`);
  const result = await runScrape(userId, filters);
  logger.info(
    `[ScraperWorker] Done: saved=${result.saved}, dupes=${result.duplicates}`,
  );
  return result;
});

scraperQueue.on("failed", (job, err) => {
  logger.error(`[ScraperWorker] Job ${job.id} failed: ${err.message}`);
});

module.exports = { applicationQueue, scraperQueue };
