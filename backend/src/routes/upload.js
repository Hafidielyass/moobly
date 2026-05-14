// routes/upload.js
const router = require("express").Router();
const { protect } = require("../middleware/auth");
const {
  upload,
  uploadProfile,
  uploadTemplate,
  listTemplates,
} = require("../controllers/uploadController");
router.use(protect);
router.post("/profile", upload.single("csv"), uploadProfile);
router.post("/template", upload.single("tex"), uploadTemplate);
router.get("/templates", listTemplates);
module.exports = router;
