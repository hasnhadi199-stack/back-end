const mongoose = require("mongoose");

// مكافآت الأيام السبعة (50+ ذهب أسبوعياً)
const DAY_REWARDS = [2, 4, 6, 8, 10, 10, 10];

const CheckInSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  currentDay: { type: Number, default: 1, min: 1, max: 7 },
  weekStartAt: { type: Date, default: Date.now },
  nextClaimAt: { type: Date, default: null }, // متى يمكن استلام المكافأة
  lastClaimedAt: { type: Date, default: null },
}, { timestamps: true });

CheckInSchema.statics.getRewardForDay = (day) => DAY_REWARDS[(day - 1) % 7] ?? 2;

module.exports = mongoose.model("CheckIn", CheckInSchema);
module.exports.DAY_REWARDS = DAY_REWARDS;
