/**
 * services/application/emailApplicant.js
 * Send job application emails with tailored CV + cover letter
 */

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const Application = require("../../models/Application");
const Job = require("../../models/Job");
const CV = require("../../models/CV");
const Profile = require("../../models/Profile");
const logger = require("../../utils/logger");

// ─── Transporter ───────────────────────────────────────────────────
const createTransporter = () =>
  nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

/**
 * sendApplicationEmail — Send email application for a job
 * @param {string} applicationId
 * @returns {Object} updated application
 */
exports.sendApplicationEmail = async (applicationId) => {
  const application = await Application.findById(applicationId)
    .populate("job")
    .populate("cv")
    .populate({ path: "profile", model: "Profile" });

  if (!application) throw new Error("Application not found");

  const { job, cv, profile } = application;

  if (!job.contact_email) {
    throw new Error("No contact email for this job");
  }

  // Generate cover letter if not provided
  const coverLetter =
    application.coverLetter || generateCoverLetter(profile, job);

  // Build email
  const subject = `Application for ${job.title} – ${profile?.name || "Candidate"}`;
  const htmlBody = buildEmailBody(profile, job, coverLetter);
  const textBody = coverLetter;

  const mailOptions = {
    from:
      process.env.EMAIL_FROM || `"${profile?.name}" <${process.env.SMTP_USER}>`,
    replyTo: profile?.email || process.env.SMTP_USER,
    to: job.contact_email,
    subject,
    html: htmlBody,
    text: textBody,
    attachments: [],
  };

  // Attach CV PDF
  if (cv?.pdfPath && fs.existsSync(cv.pdfPath)) {
    mailOptions.attachments.push({
      filename: `CV_${(profile?.name || "Candidate").replace(/\s+/g, "_")}.pdf`,
      path: cv.pdfPath,
      contentType: "application/pdf",
    });
  }

  const transporter = createTransporter();
  const info = await transporter.sendMail(mailOptions);

  logger.info(
    `[EmailApplicant] Email sent to ${job.contact_email} | MsgID: ${info.messageId}`,
  );

  // Update application
  await Application.findByIdAndUpdate(applicationId, {
    status: "applied",
    appliedAt: new Date(),
    "emailDetails.to": job.contact_email,
    "emailDetails.subject": subject,
    "emailDetails.body": textBody,
    "emailDetails.sentAt": new Date(),
    "emailDetails.messageId": info.messageId,
    coverLetter,
  });

  // Update job status
  await Job.findByIdAndUpdate(job._id, { status: "applied" });

  return Application.findById(applicationId).populate("job");
};

// ─── Cover letter generator ────────────────────────────────────────

function generateCoverLetter(profile, job) {
  const name = profile?.name || "Dear Hiring Manager";
  const title = job.title || "the position";
  const company = job.company || "your company";
  const skills = (profile?.skills || []).slice(0, 4).join(", ");

  return `Dear Hiring Team,

I am writing to express my strong interest in the ${title} position at ${company}. With my background in ${skills || "relevant technologies"}, I am confident in my ability to contribute meaningfully to your team.

${profile?.summary || "I bring a solid foundation of experience and a passion for delivering high-quality results."}

I am particularly excited about this opportunity because it aligns with my professional goals and expertise. I would welcome the chance to discuss how my skills and experiences could benefit ${company}.

Thank you for your time and consideration. I look forward to hearing from you.

Best regards,
${name}
${profile?.email || ""}
${profile?.phone || ""}
${profile?.linkedin ? `LinkedIn: ${profile.linkedin}` : ""}`;
}

function buildEmailBody(profile, job, coverLetter) {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #6366f1;">Application for ${job.title}</h2>
  <p style="color: #666;">Company: <strong>${job.company}</strong></p>
  <hr style="border-color: #eee;">
  <div style="white-space: pre-line; line-height: 1.7;">${coverLetter}</div>
  <hr style="border-color: #eee;">
  <p style="font-size: 12px; color: #999;">
    This application was sent via Mobly – Automated Job Application System
  </p>
</body>
</html>`;
}
