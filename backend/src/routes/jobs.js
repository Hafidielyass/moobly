// ══════════════════════════════════════════════════════════════
// routes/jobs.js
// ══════════════════════════════════════════════════════════════
const jobRouter = require("express").Router();
const { protect } = require("../middleware/auth");
const {
  getJobs,
  getJob,
  updateJob,
  deleteJob,
  triggerScrape,
  getStats,
} = require("../controllers/jobController");

jobRouter.use(protect);
jobRouter.get("/stats", getStats);
jobRouter.post("/scrape", triggerScrape);
jobRouter.get("/", getJobs);
jobRouter.get("/:id", getJob);
jobRouter.patch("/:id", updateJob);
jobRouter.delete("/:id", deleteJob);

module.exports = jobRouter;

// ══════════════════════════════════════════════════════════════
// !! The following routes are in separate files (split below) !!
// ══════════════════════════════════════════════════════════════
