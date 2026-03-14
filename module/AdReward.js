const mongoose = require("mongoose");

const AdRewardSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD
  count: { type: Number, default: 0 },
  lastAdAt: { type: Date, default: null }, // آخر مشاهدة إعلان (للـ cooldown)
}, { timestamps: true });

AdRewardSchema.index({ userId: 1, date: 1 }, { unique: true });

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

AdRewardSchema.statics.getWeekStart = getWeekStart;

module.exports = mongoose.model("AdReward", AdRewardSchema);
