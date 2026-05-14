// test-mongo.js
const path = require("path");
const mongoose = require("mongoose");

// Load environment variables from backend/.env
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

async function main() {
  const uri = process.env.MONGO_URI; // use your existing env var name
  if (!uri) throw new Error("MONGO_URI not set");
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.log("MongoDB connection OK");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("MongoDB connection failed:", err.message);
  process.exit(1);
});
