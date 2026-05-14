/**
 * services/cv/cvGenerator.js
 * Tailors LaTeX CV to job requirements, compiles to PDF
 */

const fs = require("fs");
const path = require("path");
const { v4: uuid } = require("uuid");
const Profile = require("../../models/Profile");
const Job = require("../../models/Job");
const CV = require("../../models/CV");
const latexCompiler = require("./latexCompiler");
const logger = require("../../utils/logger");

const CV_OUTPUT_DIR =
  process.env.CV_OUTPUT_DIR || path.join(__dirname, "../../generated-cvs");

/**
 * generateCV — Build a tailored CV for a specific job
 * @param {string} userId
 * @param {string} profileId
 * @param {string} jobId — null for generic CV
 * @param {string} templatePath — path to .tex template file
 * @returns {Object} CV document
 */
const generateCV = async (userId, profileId, jobId, templatePath) => {
  // Ensure output dir
  const userCvDir = path.join(CV_OUTPUT_DIR, userId);
  fs.mkdirSync(userCvDir, { recursive: true });

  // Fetch profile and job
  const profile = await Profile.findOne({ _id: profileId, user: userId });
  if (!profile) throw new Error("Profile not found");

  let job = null;
  let injectedKeywords = [];
  let tailoredSummary = profile.summary;

  if (jobId) {
    job = await Job.findOne({ _id: jobId, user: userId });
    if (!job) throw new Error("Job not found");

    // Extract keywords from job
    injectedKeywords = extractJobKeywords(job);

    // Tailor summary
    tailoredSummary = tailorSummary(
      profile.summary,
      profile.title,
      job.title,
      injectedKeywords,
    );
  }

  // Create CV record
  const cvRecord = await CV.create({
    user: userId,
    profile: profileId,
    job: jobId || null,
    status: "generating",
    templatePath,
    templateName: path.basename(templatePath || "default", ".tex"),
    injectedKeywords,
    tailoredSummary,
    jobTitle: job?.title,
    companyName: job?.company,
    label: job ? `${job.title} @ ${job.company}` : "Generic CV",
  });

  try {
    // Read template
    let templateContent;
    if (templatePath && fs.existsSync(templatePath)) {
      templateContent = fs.readFileSync(templatePath, "utf8");
    } else {
      templateContent = getDefaultLatexTemplate();
    }

    // Inject profile data into template
    const latex = injectProfileIntoLatex(templateContent, profile, {
      tailoredSummary,
      injectedKeywords,
      jobTitle: job?.title,
      companyName: job?.company,
    });

    // Write .tex file
    const texId = uuid();
    const texPath = path.join(userCvDir, `${texId}.tex`);
    const pdfPath = path.join(userCvDir, `${texId}.pdf`);
    fs.writeFileSync(texPath, latex, "utf8");

    // Compile LaTeX → PDF
    await latexCompiler.compile(texPath, userCvDir);

    // Verify PDF was created
    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF compilation failed: output file not found");
    }

    const pdfUrl = `/generated-cvs/${userId}/${texId}.pdf`;

    // Update CV record
    await CV.findByIdAndUpdate(cvRecord._id, {
      status: "ready",
      latexSource: texPath,
      pdfPath,
      pdfUrl,
    });

    logger.info(`CV generated: ${cvRecord._id} → ${pdfPath}`);
    return await CV.findById(cvRecord._id).populate("job", "title company");
  } catch (err) {
    await CV.findByIdAndUpdate(cvRecord._id, {
      status: "failed",
      error: err.message,
    });
    logger.error(`CV generation failed for ${cvRecord._id}: ${err.message}`);
    throw err;
  }
};

// ─── LaTeX injection ───────────────────────────────────────────────

function injectProfileIntoLatex(template, profile, extras = {}) {
  const { tailoredSummary, injectedKeywords, jobTitle, companyName } = extras;

  const replacements = {
    "{{NAME}}": escapeLaTeX(profile.name),
    "{{EMAIL}}": escapeLaTeX(profile.email),
    "{{PHONE}}": escapeLaTeX(profile.phone),
    "{{LOCATION}}": escapeLaTeX(profile.location),
    "{{LINKEDIN}}": escapeLaTeX(profile.linkedin),
    "{{GITHUB}}": escapeLaTeX(profile.github),
    "{{PORTFOLIO}}": escapeLaTeX(profile.portfolio),
    "{{TITLE}}": escapeLaTeX(jobTitle || profile.title),
    "{{SUMMARY}}": escapeLaTeX(tailoredSummary || profile.summary),
    "{{SKILLS}}": buildSkillsList(profile.skills, injectedKeywords),
    "{{EXPERIENCE}}": buildExperienceSection(profile.experience),
    "{{EDUCATION}}": buildEducationSection(profile.education),
    "{{LANGUAGES}}": buildLanguagesSection(profile.languages),
    "{{CERTIFICATIONS}}": buildCertificationsSection(profile.certifications),
    "{{COMPANY_NAME}}": escapeLaTeX(companyName || ""),
    "{{KEYWORDS}}": (injectedKeywords || []).map(escapeLaTeX).join(", "),
  };

  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }
  return result;
}

function escapeLaTeX(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function buildSkillsList(skills = [], injected = []) {
  const all = [...new Set([...skills, ...injected])];
  return all.map(escapeLaTeX).join(", ");
}

function buildExperienceSection(experience = []) {
  return experience
    .map(
      (exp) =>
        `\\cventry{${escapeLaTeX(exp.startDate)} -- ${escapeLaTeX(exp.endDate)}}{${escapeLaTeX(exp.role)}}{${escapeLaTeX(exp.company)}}{}{}{${escapeLaTeX(exp.description)}}`,
    )
    .join("\n");
}

function buildEducationSection(education = []) {
  return education
    .map(
      (edu) =>
        `\\cventry{${escapeLaTeX(edu.startYear)} -- ${escapeLaTeX(edu.endYear)}}{${escapeLaTeX(edu.degree)}}{${escapeLaTeX(edu.institution)}}{${escapeLaTeX(edu.field)}}{${escapeLaTeX(edu.gpa)}}{}`,
    )
    .join("\n");
}

function buildLanguagesSection(languages = []) {
  return languages
    .map((l) => `\\cvlanguage{${escapeLaTeX(l.name)}}{${l.level}}{}`)
    .join("\n");
}

function buildCertificationsSection(certs = []) {
  return certs
    .map(
      (c) =>
        `\\cvitem{${escapeLaTeX(c.year)}}{${escapeLaTeX(c.name)} -- ${escapeLaTeX(c.issuer)}}`,
    )
    .join("\n");
}

// ─── Keyword extraction ────────────────────────────────────────────

function extractJobKeywords(job) {
  const text =
    `${job.title} ${job.description} ${job.requirements}`.toLowerCase();
  const techKeywords = [
    "javascript",
    "typescript",
    "python",
    "java",
    "react",
    "node",
    "express",
    "mongodb",
    "postgresql",
    "mysql",
    "aws",
    "gcp",
    "azure",
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
    "nginx",
    "spring",
    "django",
    "flask",
    "laravel",
    "php",
    "ruby",
    "rails",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "pandas",
    "numpy",
    "agile",
    "scrum",
    "ci/cd",
    "devops",
    "microservices",
    "api",
    "oauth",
  ];
  return techKeywords.filter((kw) => text.includes(kw));
}

function tailorSummary(originalSummary, profileTitle, jobTitle, keywords) {
  if (!originalSummary) return "";
  const kwList = keywords.slice(0, 5).join(", ");
  const intro = jobTitle
    ? `Experienced ${profileTitle || "professional"} targeting ${jobTitle} roles with expertise in ${kwList || "relevant technologies"}. `
    : "";
  return intro + originalSummary;
}

// ─── Default LaTeX template ────────────────────────────────────────

function getDefaultLatexTemplate() {
  return `\\documentclass[11pt,a4paper,sans]{moderncv}
\\moderncvstyle{banking}
\\moderncvcolor{blue}
\\usepackage[utf8]{inputenc}
\\usepackage[scale=0.85]{geometry}

\\name{{{FIRST_NAME}}}{{{LAST_NAME}}}
\\title{{{TITLE}}}
\\phone[mobile]{{{PHONE}}}
\\email{{{EMAIL}}}
\\social[linkedin]{{{LINKEDIN}}}
\\social[github]{{{GITHUB}}}
\\address{{{LOCATION}}}{}{}

\\begin{document}
\\makecvtitle

\\section{Summary}
\\cvitem{}{{{SUMMARY}}}

\\section{Skills}
\\cvitem{Technical}{{{SKILLS}}}

\\section{Experience}
{{EXPERIENCE}}

\\section{Education}
{{EDUCATION}}

\\section{Languages}
{{LANGUAGES}}

\\section{Certifications}
{{CERTIFICATIONS}}

\\end{document}
`
    .replace("{{FIRST_NAME}}", "{{NAME}}")
    .replace("{{LAST_NAME}}", "");
}

module.exports = { generateCV };
