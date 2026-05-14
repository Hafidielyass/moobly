// routes/applications.js
const appRouter = require("express").Router();
const { protect } = require("../middleware/auth");
const {
  getApplications,
  getApplication,
  createApplication,
  retryApplication,
  updateApplication,
  getSummary,
} = require("../controllers/applicationController");

appRouter.use(protect);
appRouter.get("/summary", getSummary);
appRouter.get("/", getApplications);
appRouter.post("/", createApplication);
appRouter.get("/:id", getApplication);
appRouter.patch("/:id", updateApplication);
appRouter.post("/:id/retry", retryApplication);

module.exports = appRouter;
