/**
 * services/scraper/indeedScraper.js
 * Playwright-based Indeed scraper with anti-bot strategies
 */

const { chromium } = require("playwright");
const logger = require("../../utils/logger");
const {
  randomDelay,
  getRandomUserAgent,
  normalizeJobType,
} = require("./scraperUtils");

const BASE_URL = "https://www.indeed.com";
const INDEED_SELECTORS = {
  jobCards: '[data-testid="slider_item"], .job_seen_beacon, .tapItem',
  title: '[data-testid="jobTitle"] > span, .jobTitle span',
  company: '[data-testid="company-name"], .companyName',
  location: '[data-testid="text-location"], .companyLocation',
  salary: '[data-testid="attribute_snippet_testid"], .salary-snippet',
  summary: '.job-snippet, [data-testid="job-snippet"]',
  date: '[data-testid="myJobsStateDate"], .date',
  applyLink: '[data-testid="job-title"] a, .jobTitle a',
  pagination: '[data-testid="pagination-page-next"], [aria-label="Next Page"]',
};

/**
 * scrapeIndeed — Scrape job listings from Indeed
 * @param {Object} filters - { title, location, dateRange, maxResults }
 * @returns {Array} normalized job objects
 */
const scrapeIndeed = async (filters = {}) => {
  const {
    title = "developer",
    location = "",
    dateRange = null, // e.g. '3' for last 3 days
    maxResults = 30,
  } = filters;

  let browser;
  const jobs = [];

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-infobars",
        "--window-size=1366,768",
      ],
    });

    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1366, height: 768 },
      locale: "en-US",
      timezoneId: "America/New_York",
      // Block ads/trackers
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
      },
    });

    // Block unnecessary resources
    await context.route(
      "**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf}",
      (route) => route.abort(),
    );
    await context.route("**/ads/**", (route) => route.abort());
    await context.route("**/analytics**", (route) => route.abort());

    const page = await context.newPage();

    // Override automation detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    let pageNum = 0;
    let hasMore = true;

    while (hasMore && jobs.length < maxResults) {
      const start = pageNum * 10;
      let url = `${BASE_URL}/jobs?q=${encodeURIComponent(title)}`;
      if (location) url += `&l=${encodeURIComponent(location)}`;
      if (dateRange) url += `&fromage=${dateRange}`;
      if (start > 0) url += `&start=${start}`;

      logger.info(`[Indeed] Scraping page ${pageNum + 1}: ${url}`);

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await randomDelay(2000, 4000);

        // Handle cookie consent
        try {
          await page.click('[id*="cookie"] button, [aria-label*="Accept"]', {
            timeout: 3000,
          });
        } catch (_) {}

        const cards = await page.$$(INDEED_SELECTORS.jobCards);
        if (cards.length === 0) {
          logger.warn("[Indeed] No job cards found on page. Stopping.");
          break;
        }

        for (const card of cards) {
          if (jobs.length >= maxResults) break;
          try {
            const job = await extractJobFromCard(page, card);
            if (job) jobs.push(job);
          } catch (e) {
            logger.debug(`[Indeed] Card extraction error: ${e.message}`);
          }
          await randomDelay(300, 800);
        }

        // Check next page
        const nextBtn = await page.$(INDEED_SELECTORS.pagination);
        if (!nextBtn) {
          hasMore = false;
        } else {
          pageNum++;
          await randomDelay(2000, 5000);
        }
      } catch (pageErr) {
        logger.error(
          `[Indeed] Page error on page ${pageNum + 1}: ${pageErr.message}`,
        );
        hasMore = false;
      }
    }

    await browser.close();
    logger.info(`[Indeed] Scraped ${jobs.length} jobs for "${title}"`);
    return jobs;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    logger.error(`[Indeed] Fatal error: ${err.message}`);
    throw err;
  }
};

async function extractJobFromCard(page, card) {
  try {
    const titleEl = await card.$(INDEED_SELECTORS.title);
    const companyEl = await card.$(INDEED_SELECTORS.company);
    const locationEl = await card.$(INDEED_SELECTORS.location);
    const salaryEl = await card.$(INDEED_SELECTORS.salary);
    const summaryEl = await card.$(INDEED_SELECTORS.summary);
    const dateEl = await card.$(INDEED_SELECTORS.date);
    const linkEl = await card.$(INDEED_SELECTORS.applyLink);

    const title = titleEl ? (await titleEl.textContent()).trim() : null;
    if (!title) return null;

    const company = companyEl
      ? (await companyEl.textContent()).trim()
      : "Unknown";
    const location = locationEl ? (await locationEl.textContent()).trim() : "";
    const salary = salaryEl
      ? (await salaryEl.textContent()).trim()
      : "Not specified";
    const summary = summaryEl ? (await summaryEl.textContent()).trim() : "";
    const dateText = dateEl ? (await dateEl.textContent()).trim() : "";
    const href = linkEl ? await linkEl.getAttribute("href") : null;

    const applyUrl = href
      ? href.startsWith("http")
        ? href
        : `${BASE_URL}${href}`
      : null;

    if (!applyUrl) return null;

    return {
      title,
      company,
      location,
      description: summary,
      requirements: "",
      salary,
      job_type: normalizeJobType(salary + " " + title),
      posted_date: parseIndeedDate(dateText),
      apply_url: applyUrl,
      apply_method: "website",
      contact_email: null,
      platform: "indeed",
      platform_job_id: applyUrl.match(/jk=([a-z0-9]+)/i)?.[1] || null,
      keywords: extractKeywords(title + " " + summary),
    };
  } catch (err) {
    logger.debug(`[Indeed] Card parse error: ${err.message}`);
    return null;
  }
}

function parseIndeedDate(dateText) {
  if (!dateText) return null;
  const now = new Date();
  if (/today|just posted/i.test(dateText)) return now;
  const daysMatch = dateText.match(/(\d+)\s+day/i);
  if (daysMatch) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(daysMatch[1]));
    return d;
  }
  return null;
}

function extractKeywords(text) {
  const techWords = [
    "javascript",
    "typescript",
    "python",
    "java",
    "react",
    "node",
    "express",
    "mongodb",
    "postgresql",
    "aws",
    "docker",
    "kubernetes",
    "git",
    "rest",
    "graphql",
    "html",
    "css",
    "vue",
    "angular",
    "next",
    "sql",
    "redis",
    "linux",
  ];
  const lower = text.toLowerCase();
  return techWords.filter((kw) => lower.includes(kw));
}

module.exports = { scrapeIndeed };
