/**
 * services/notification/whatsapp.js
 * WhatsApp Business API notifications via Meta Graph API
 */

const axios = require("axios");
const logger = require("../../utils/logger");

const API_URL =
  process.env.WHATSAPP_API_URL || "https://graph.facebook.com/v19.0";
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_TOKEN;

/**
 * sendWhatsAppMessage — Send a template or text message
 * @param {string} to — recipient phone number with country code (e.g. +212XXXXXXXXX)
 * @param {string} messageType — 'application_failed' | 'new_jobs' | 'manual_review' | 'scrape_error'
 * @param {Object} params — template parameters
 */
exports.sendWhatsAppMessage = async (to, messageType, params = {}) => {
  if (!PHONE_ID || !TOKEN) {
    logger.warn("[WhatsApp] WhatsApp not configured. Skipping notification.");
    return null;
  }

  const payload = buildPayload(to, messageType, params);

  try {
    const response = await axios.post(
      `${API_URL}/${PHONE_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    logger.info(`[WhatsApp] Message sent to ${to}: ${messageType}`);
    return response.data;
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    logger.error(`[WhatsApp] Send failed: ${errMsg}`);
    throw new Error(`WhatsApp notification failed: ${errMsg}`);
  }
};

/**
 * sendApplicationFailedNotification
 */
exports.sendApplicationFailedNotification = async (
  to,
  { jobTitle, company, errorReason, retryUrl },
) => {
  return exports.sendWhatsAppMessage(to, "application_failed", {
    jobTitle,
    company,
    errorReason,
    retryUrl,
  });
};

/**
 * sendNewJobsNotification
 */
exports.sendNewJobsNotification = async (
  to,
  { count, platform, searchTitle },
) => {
  return exports.sendWhatsAppMessage(to, "new_jobs", {
    count,
    platform,
    searchTitle,
  });
};

/**
 * sendManualReviewNotification
 */
exports.sendManualReviewNotification = async (
  to,
  { jobTitle, company, actionLink },
) => {
  return exports.sendWhatsAppMessage(to, "manual_review", {
    jobTitle,
    company,
    actionLink,
  });
};

// ─── Payload builders ──────────────────────────────────────────────

function buildPayload(to, type, params) {
  // Using free-form text messages (works without approved templates for testing)
  const body = formatMessageBody(type, params);

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\s+/g, ""),
    type: "text",
    text: {
      preview_url: false,
      body,
    },
  };
}

function formatMessageBody(type, params) {
  const {
    jobTitle,
    company,
    errorReason,
    retryUrl,
    count,
    platform,
    actionLink,
    searchTitle,
  } = params;

  const messages = {
    application_failed:
      `🔴 *Application Failed*\n\n` +
      `📌 *Job:* ${jobTitle || "N/A"}\n` +
      `🏢 *Company:* ${company || "N/A"}\n` +
      `❌ *Reason:* ${errorReason || "Unknown error"}\n` +
      (retryUrl ? `🔄 *Retry:* ${retryUrl}` : ""),

    new_jobs:
      `✅ *New Jobs Found*\n\n` +
      `📊 *${count || 0}* new jobs found on *${platform || "multiple platforms"}*\n` +
      `🔍 *Search:* ${searchTitle || "N/A"}\n` +
      `🚀 Head to your Mobly dashboard to review and apply!`,

    manual_review:
      `⚠️ *Manual Review Required*\n\n` +
      `📌 *Job:* ${jobTitle || "N/A"}\n` +
      `🏢 *Company:* ${company || "N/A"}\n` +
      `This application requires your manual review.\n` +
      (actionLink ? `🔗 *Review:* ${actionLink}` : ""),

    scrape_error:
      `🔴 *Scraping Failed*\n\n` +
      `Platform: ${platform || "N/A"}\n` +
      `Reason: ${errorReason || "Unknown error"}\n` +
      `Please check your Mobly dashboard.`,
  };

  return messages[type] || `Mobly notification: ${type}`;
}
