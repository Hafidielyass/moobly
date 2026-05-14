// routes/profiles.js
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const Profile = require("../models/Profile");
const { AppError } = require("../middleware/errorHandler");

router.use(protect);

router.get("/", async (req, res, next) => {
  try {
    const profiles = await Profile.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.json({ profiles });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const profile = await Profile.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!profile) throw new AppError("Profile not found", 404);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const allowed = [
      "label",
      "isActive",
      "skills",
      "summary",
      "title",
      "phone",
      "whatsappNumber",
    ];
    const updates = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    });
    const profile = await Profile.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updates },
      { new: true },
    );
    if (!profile) throw new AppError("Profile not found", 404);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const profile = await Profile.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!profile) throw new AppError("Profile not found", 404);
    res.json({ message: "Profile deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
