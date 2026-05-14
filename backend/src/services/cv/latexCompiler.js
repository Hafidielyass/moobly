/**
 * services/cv/latexCompiler.js — Compile .tex to PDF using pdflatex
 */

const { exec } = require("child_process");
const path = require("path");
const logger = require("../../utils/logger");

const LATEX_BIN = process.env.LATEX_BIN || "pdflatex";
const TIMEOUT = parseInt(process.env.LATEX_TIMEOUT_MS) || 30000;

/**
 * compile — Run pdflatex on a .tex file
 * @param {string} texPath — absolute path to .tex file
 * @param {string} outputDir — directory for output PDF
 * @returns {Promise<void>}
 */
exports.compile = (texPath, outputDir) => {
  return new Promise((resolve, reject) => {
    // Run twice for cross-references
    const cmd = `${LATEX_BIN} -interaction=nonstopmode -output-directory="${outputDir}" "${texPath}"`;

    logger.debug(`[LaTeX] Compiling: ${cmd}`);

    // First pass
    exec(cmd, { timeout: TIMEOUT }, (err1, stdout1, stderr1) => {
      if (err1 && !stdout1.includes("Output written")) {
        logger.error(`[LaTeX] Pass 1 error: ${stderr1 || err1.message}`);
        // Try to extract useful error from stdout
        const latexError = extractLatexError(stdout1);
        return reject(
          new Error(`LaTeX compilation failed: ${latexError || err1.message}`),
        );
      }

      // Second pass for correct references
      exec(cmd, { timeout: TIMEOUT }, (err2, stdout2, stderr2) => {
        if (err2 && !stdout2.includes("Output written")) {
          logger.warn(`[LaTeX] Pass 2 warning: ${stderr2 || err2.message}`);
        }
        logger.debug("[LaTeX] Compilation complete.");
        resolve();
      });
    });
  });
};

function extractLatexError(stdout) {
  if (!stdout) return null;
  const lines = stdout.split("\n");
  const errorLine = lines.find((l) => l.startsWith("!"));
  return errorLine || null;
}

/**
 * isLatexAvailable — Check if pdflatex is installed
 */
exports.isLatexAvailable = () => {
  return new Promise((resolve) => {
    exec(`${LATEX_BIN} --version`, (err) => resolve(!err));
  });
};
