/**
 * routes/auth.js
 */
const router = require("express").Router();
const {
  register,
  login,
  getMe,
  updatePreferences,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name required"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 8 }).withMessage("Password min 8 chars"),
  ],
  validate,
  register,
);

router.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  validate,
  login,
);

router.get("/me", protect, getMe);
router.patch("/preferences", protect, updatePreferences);

module.exports = router;
