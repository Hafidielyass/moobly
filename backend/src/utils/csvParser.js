/**
 * utils/csvParser.js — Parse user profile from CSV
 *
 * Expected CSV columns (case-insensitive):
 * name, email, phone, location, linkedin, github, portfolio, summary, title,
 * skills (semicolon-separated), languages (json or semicolon),
 * experience_* (repeated rows), education_*
 *
 * Supports flat single-row profile CSV or multi-section format.
 */

const fs = require("fs");
const csv = require("csv-parser");
const logger = require("./logger");

/**
 * parseProfileCsv — Read a CSV file and return a normalized profile object
 * @param {string} filePath — absolute path to CSV
 * @returns {Promise<Object>} profile data
 */
exports.parseProfileCsv = (filePath) => {
  return new Promise((resolve, reject) => {
    const rows = [];

    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => header.trim().toLowerCase() }))
      .on("data", (row) => rows.push(row))
      .on("error", reject)
      .on("end", () => {
        try {
          if (rows.length === 0) {
            return reject(new Error("CSV file is empty or invalid."));
          }

          // ── Single-row flat profile ───────────────────────────
          const r = rows[0];
          const profile = {
            name: r.name || "",
            email: r.email || "",
            phone: r.phone || "",
            location: r.location || r.city || "",
            linkedin: r.linkedin || "",
            github: r.github || "",
            portfolio: r.portfolio || r.website || "",
            summary: r.summary || r.bio || "",
            title: r.title || r.job_title || r.position || "",
            skills: parseList(r.skills || r.skill || ""),
            languages: parseLanguages(r.languages || r.language || ""),
            certifications: parseCertifications(
              r.certifications || r.certification || "",
            ),
            experience: parseExperience(rows),
            education: parseEducation(rows),
          };

          logger.info(`Parsed profile CSV: ${profile.name} <${profile.email}>`);
          resolve(profile);
        } catch (err) {
          reject(err);
        }
      });
  });
};

// ─── Helpers ───────────────────────────────────────────────────────

function parseList(str) {
  if (!str) return [];
  return str
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseLanguages(str) {
  if (!str) return [];
  // Format: "English:native; French:advanced" OR JSON
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {}
  return str
    .split(/[;,]/)
    .map((s) => {
      const [name, level = "intermediate"] = s.split(":").map((x) => x.trim());
      return name ? { name, level: level.toLowerCase() } : null;
    })
    .filter(Boolean);
}

function parseCertifications(str) {
  if (!str) return [];
  return str
    .split(/[;,]/)
    .map((s) => {
      const [name, issuer = "", year = ""] = s.split("|").map((x) => x.trim());
      return name ? { name, issuer, year } : null;
    })
    .filter(Boolean);
}

function parseExperience(rows) {
  // Look for experience_* columns OR rows with section=experience
  const expRows = rows.filter(
    (r) =>
      r.section === "experience" || r.exp_company || r["experience_company"],
  );
  if (expRows.length === 0) {
    // Try to extract from first row compound fields
    return [];
  }
  return expRows.map((r) => ({
    company: r.exp_company || r.experience_company || r.company || "",
    role: r.exp_role || r.experience_role || r.role || "",
    startDate: r.exp_start || r.start_date || "",
    endDate: r.exp_end || r.end_date || "Present",
    description: r.exp_description || r.description || "",
    technologies: parseList(r.exp_technologies || r.technologies || ""),
  }));
}

function parseEducation(rows) {
  const eduRows = rows.filter(
    (r) =>
      r.section === "education" ||
      r.edu_institution ||
      r["education_institution"],
  );
  return eduRows.map((r) => ({
    institution: r.edu_institution || r.institution || "",
    degree: r.edu_degree || r.degree || "",
    field: r.edu_field || r.field || "",
    startYear: r.edu_start || r.start_year || "",
    endYear: r.edu_end || r.end_year || "",
    gpa: r.gpa || "",
  }));
}
