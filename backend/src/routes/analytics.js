// routes/analytics.js
const analyticsRouter = require("express").Router();
const { protect } = require("../middleware/auth");
const {
  getDashboard,
  getTimeline,
} = require("../controllers/analyticsController");
analyticsRouter.use(protect);
analyticsRouter.get("/dashboard", getDashboard);
analyticsRouter.get("/timeline", getTimeline);
module.exports = analyticsRouter;

/* ──────────────────────────────────────────────────────────── */
// Save as routes/upload.js
// const uploadRouter = require('express').Router();
// const { protect } = require('../middleware/auth');
// const { upload, uploadProfile, uploadTemplate, listTemplates } = require('../controllers/uploadController');
// uploadRouter.use(protect);
// uploadRouter.post('/profile', upload.single('csv'), uploadProfile);
// uploadRouter.post('/template', upload.single('tex'), uploadTemplate);
// uploadRouter.get('/templates', listTemplates);
// module.exports = uploadRouter;
