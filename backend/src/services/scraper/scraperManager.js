/**
 * services/scraper/scraperManager.js
 * Orchestrates multi-platform scraping and saves to MongoDB
 */

const Job = require("../../models/Job");
const { scrapeIndeed } = require("./indeedScraper");
const { scrapeRekrute } = require("./rekruteScraper");
const { deduplicateJobs } = require("./scraperUtils");
const logger = require("../../utils/logger");

const SCRAPERS = {
  indeed: scrapeIndeed,
  rekrute: scrapeRekrute,
};

/**
 * runScrape — Run scrapers for requested platforms, save to DB
 * @param {string} userId
 * @param {Object} filters - { platforms, title, location, dateRange, maxResults }
 * @returns {{ saved: number, duplicates: number, errors: Object }}
 */
const runScrape = async (userId, filters = {}) => {
  const {
    platforms = ["indeed", "rekrute"],
    title,
    location,
    dateRange,
    maxResults = 50,
  } = filters;

  const results = { saved: 0, duplicates: 0, errors: {}, jobs: [] };

  for (const platform of platforms) {
    const scraper = SCRAPERS[platform];
    if (!scraper) {
      logger.warn(`[ScraperManager] Unknown platform: ${platform}`);
      continue;
    }

    logger.info(
      `[ScraperManager] Starting ${platform} scraper for user ${userId}`,
    );

    try {
      const rawJobs = await scraper({
        title,
        location,
        dateRange,
        maxResults: Math.ceil(maxResults / platforms.length),
      });

      const deduped = deduplicateJobs(rawJobs);

      for (const jobData of deduped) {
        try {
          // Upsert: avoid duplicates by URL + user
          const existing = await Job.findOne({
            apply_url: jobData.apply_url,
            user: userId,
          });

          if (existing) {
            results.duplicates++;
            continue;
          }

          const job = await Job.create({
            ...jobData,
            user: userId,
          });

          results.saved++;
          results.jobs.push(job);
        } catch (saveErr) {
          // Unique constraint hit = duplicate
          if (saveErr.code === 11000) {
            results.duplicates++;
          } else {
            logger.error(`[ScraperManager] Save error: ${saveErr.message}`);
          }
        }
      }

      logger.info(
        `[ScraperManager] ${platform}: scraped=${rawJobs.length}, saved=${results.saved}, dupes=${results.duplicates}`,
      );
    } catch (err) {
      logger.error(`[ScraperManager] ${platform} failed: ${err.message}`);
      results.errors[platform] = err.message;
    }
  }

  return results;
};

module.exports = { runScrape };
