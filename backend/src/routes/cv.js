// routes/cv.js
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const CV = require("../models/CV");
const { generateCV } = require("../services/cv/cvGenerator");
const logger = require("../utils/logger");

router.use(protect);

// GET /api/cv — List user's CVs
router.get("/", async (req, res, next) => {
  try {
    const cvs = await CV.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate("job", "title company")
      .lean();
    res.json({ cvs });
  } catch (err) {
    next(err);
  }
});

// POST /api/cv/generate — Generate tailored CV
router.post("/generate", async (req, res, next) => {
  try {
    const { profileId, jobId, templatePath } = req.body;
    if (!profileId)
      return res.status(400).json({ error: "profileId required" });
    const cv = await generateCV(req.user._id, profileId, jobId, templatePath);
    res.status(201).json({ cv });
  } catch (err) {
    next(err);
  }
});

// GET /api/cv/:id
router.get("/:id", async (req, res, next) => {
  try {
    const cv = await CV.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("job");
    if (!cv) return res.status(404).json({ error: "CV not found" });
    res.json({ cv });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/cv/:id
router.delete("/:id", async (req, res, next) => {
  try {
    const cv = await CV.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!cv) return res.status(404).json({ error: "CV not found" });
    res.json({ message: "CV deleted" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
