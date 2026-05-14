/**
 * services/queue/applicationQueue.js — Bull queue for application processing
 */

const Bull = require("bull");
const logger = require("../../utils/logger");

const redisConfig = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD || undefined,
};

const applicationQueue = new Bull("applications", {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
});

applicationQueue.on("error", (err) => {
  logger.error(`[AppQueue] Queue error: ${err.message}`);
});

applicationQueue.on("failed", (job, err) => {
  logger.warn(`[AppQueue] Job ${job.id} failed: ${err.message}`);
});

module.exports = applicationQueue;
