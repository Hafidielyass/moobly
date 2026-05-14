/**
 * services/scraper/rekruteScraper.js
 * Playwright-based Rekrute.com scraper (Morocco job board)
 */

const { chromium } = require("playwright");
const logger = require("../../utils/logger");
const {
  randomDelay,
  getRandomUserAgent,
  normalizeJobType,
} = require("./scraperUtils");

const BASE_URL = "https://www.rekrute.com";

const SELECTORS = {
  jobList: ".post-id",
  title: ".titreJob, h3 a, .job-name",
  company: ".company-name, .companyName",
  location: ".location, .lieu",
  salary: ".salary, .salaire",
  description: ".job-desc, .description p",
  date: ".date-postulation, .date",
  link: "h3 a, .titreJob a",
  pagination: '.next a, [rel="next"]',
};

/**
 * scrapeRekrute — Scrape job listings from Rekrute
 * @param {Object} filters - { title, location, dateRange, maxResults }
 * @returns {Array} normalized job objects
 */
const scrapeRekrute = async (filters = {}) => {
  const {
    title = "développeur",
    location = "",
    dateRange = null,
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
      ],
    });

    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
      viewport: { width: 1280, height: 720 },
      locale: "fr-FR",
      extraHTTPHeaders: { "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
    });

    await context.route("**/*.{png,jpg,jpeg,gif,ico,woff,woff2}", (r) =>
      r.abort(),
    );

    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    let pageNum = 1;
    let hasMore = true;

    while (hasMore && jobs.length < maxResults) {
      // Build Rekrute search URL
      const searchParams = new URLSearchParams();
      if (title) searchParams.set("s", title);
      if (location) searchParams.set("v", location);
      searchParams.set("p", pageNum.toString());

      const url = `${BASE_URL}/offres-emploi.html?${searchParams.toString()}`;
      logger.info(`[Rekrute] Scraping page ${pageNum}: ${url}`);

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await randomDelay(2000, 3500);

        const cards = await page.$$(SELECTORS.jobList);
        if (cards.length === 0) {
          logger.info("[Rekrute] No more jobs found.");
          break;
        }

        // Get all detail URLs first
        const jobUrls = [];
        for (const card of cards) {
          const linkEl = await card.$(SELECTORS.link);
          if (linkEl) {
            const href = await linkEl.getAttribute("href");
            if (href) {
              jobUrls.push(
                href.startsWith("http") ? href : `${BASE_URL}${href}`,
              );
            }
          }
        }

        // Scrape each job detail page for richer data
        for (const jobUrl of jobUrls) {
          if (jobs.length >= maxResults) break;
          try {
            const job = await scrapeJobDetail(page, jobUrl);
            if (job) jobs.push(job);
            await randomDelay(1500, 3000);
          } catch (e) {
            logger.debug(`[Rekrute] Job detail error: ${e.message}`);
          }
        }

        // Next page
        const nextEl = await page.$(SELECTORS.pagination);
        if (!nextEl) {
          hasMore = false;
        } else {
          pageNum++;
          await randomDelay(2000, 4000);
        }
      } catch (pageErr) {
        logger.error(`[Rekrute] Page error: ${pageErr.message}`);
        hasMore = false;
      }
    }

    await browser.close();
    logger.info(`[Rekrute] Scraped ${jobs.length} jobs for "${title}"`);
    return jobs;
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    logger.error(`[Rekrute] Fatal error: ${err.message}`);
    throw err;
  }
};

async function scrapeJobDetail(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  await randomDelay(800, 1500);

  const getText = async (sel) => {
    try {
      const el = await page.$(sel);
      return el ? (await el.textContent()).trim() : "";
    } catch (_) {
      return "";
    }
  };

  const title = await getText("h1, .job-title, .titre-offre");
  if (!title) return null;

  const company = await getText(".company, .entreprise, .recruteur-name");
  const location = await getText(".location, .ville, .lieu");
  const description = await getText(
    ".description, .job-description, #description",
  );
  const requirements = await getText(".profil, .requirements, .criteres");
  const salary = await getText(".salaire, .salary-range, .remuneration");
  const dateText = await getText(".date, .date-publication");

  // Extract contact email if visible
  const emailMatch = (await page.content()).match(
    /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  );
  const contactEmail = emailMatch ? emailMatch[0] : null;

  return {
    title,
    company: company || "Unknown",
    location: location || "Maroc",
    description,
    requirements,
    salary: salary || "Non spécifié",
    job_type: normalizeJobType(title + " " + description),
    posted_date: parseFrenchDate(dateText),
    apply_url: url,
    apply_method: contactEmail ? "email" : "website",
    contact_email: contactEmail,
    platform: "rekrute",
    platform_job_id: url.match(/\/(\d+)\.html/)?.[1] || null,
    keywords: extractKeywords(title + " " + description),
  };
}

function parseFrenchDate(dateText) {
  if (!dateText) return null;
  const now = new Date();
  const months = {
    janvier: 0,
    février: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    août: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    décembre: 11,
  };
  const match = dateText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    const m = months[month.toLowerCase()];
    if (m !== undefined) {
      return new Date(parseInt(year), m, parseInt(day));
    }
  }
  return now;
}

function extractKeywords(text) {
  const techWords = [
    "javascript",
    "typescript",
    "python",
    "java",
    "react",
    "node",
    "php",
    "laravel",
    "angular",
    "vue",
    "mysql",
    "mongodb",
    "postgresql",
    "docker",
    "git",
    "linux",
    "aws",
    "spring",
    "sql",
    "html",
    "css",
    "rest",
    "api",
  ];
  const lower = text.toLowerCase();
  return techWords.filter((kw) => lower.includes(kw));
}

module.exports = { scrapeRekrute };
