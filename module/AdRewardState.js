const mongoose = require("mongoose");

const AdRewardStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  lastAdAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("AdRewardState", AdRewardStateSchema);
