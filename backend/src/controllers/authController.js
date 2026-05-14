/**
 * controllers/authController.js
 */

const User = require("../models/User");
const { generateToken } = require("../middleware/auth");
const logger = require("../utils/logger");

// ─── Register ──────────────────────────────────────────────────────
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email already registered." });
    }

    const user = await User.create({ name, email, password });
    const token = generateToken(user._id);

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        initials: user.initials,
        preferences: user.preferences,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Login ─────────────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findByEmailWithPassword(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account deactivated." });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    logger.info(`User logged in: ${email}`);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        initials: user.initials,
        preferences: user.preferences,
        whatsappNumber: user.whatsappNumber,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get current user ──────────────────────────────────────────────
exports.getMe = async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      initials: req.user.initials,
      preferences: req.user.preferences,
      whatsappNumber: req.user.whatsappNumber,
      lastLogin: req.user.lastLogin,
      createdAt: req.user.createdAt,
    },
  });
};

// ─── Update preferences ────────────────────────────────────────────
exports.updatePreferences = async (req, res, next) => {
  try {
    const allowed = [
      "autoApply",
      "manualReview",
      "emailNotifications",
      "whatsappNotifications",
      "defaultPlatforms",
    ];

    const updates = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) {
        updates[`preferences.${key}`] = req.body[key];
      }
    });

    if (req.body.whatsappNumber !== undefined) {
      updates.whatsappNumber = req.body.whatsappNumber;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    res.json({ user });
  } catch (err) {
    next(err);
  }
};
