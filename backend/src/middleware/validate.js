/**
 * middleware/validate.js — express-validator error handler
 */
const { validationResult } = require("express-validator");

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors
        .array()
        .map((e) => e.msg)
        .join(". "),
      fields: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};
