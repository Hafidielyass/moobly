/**
 * services/scraper/scraperUtils.js — Shared scraper helpers
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.3; rv:123.0) Gecko/20100101 Firefox/123.0",
];

exports.getRandomUserAgent = () =>
  USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

exports.randomDelay = (min = 1000, max = 3000) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min),
  );

exports.normalizeJobType = (text) => {
  const lower = (text || "").toLowerCase();
  if (/part.time|temps partiel/i.test(lower)) return "part-time";
  if (/contract|freelance|mission/i.test(lower)) return "contract";
  if (/internship|stage|intern/i.test(lower)) return "internship";
  if (/remote|télétravail|teletravail/i.test(lower)) return "remote";
  if (/hybrid|hybride/i.test(lower)) return "hybrid";
  if (/full.time|temps plein/i.test(lower)) return "full-time";
  return "full-time";
};

exports.deduplicateJobs = (jobs) => {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.apply_url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
