const mongoose = require("mongoose");

// مشاركة الأرباح: هدف تراكمي — اجمع نقاط حتى 10$ وسحب
// كل 2000 نقطة = 0.06 دولار
const POINTS_PER_006_USD = 2000;
const USD_PER_2000_POINTS = 0.06;
const POINTS_PER_DOLLAR = POINTS_PER_006_USD / USD_PER_2000_POINTS; // ≈ 33333
const AD_POINTS = 1; // 0.001$ لكل إعلان = إيرادنا تقريباً (بدون خسارة)
const CHECKIN_POINTS = 20; // 0.02$ لكل يوم تسجيل (مكافأة إضافية صغيرة)
const WITHDRAW_GOAL = 10; // 10$ للوصول والسحب

const RevenueShareSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balancePoints: { type: Number, default: 0 }, // نقاط قابلة للسحب (100 نقطة = 1$)
  weekStart: { type: String, required: true }, // YYYY-MM-DD بداية الأسبوع
  weekEarnedPoints: { type: Number, default: 0 }, // للعرض فقط (بدون حد أسبوعي)
  withdrawalRequests: [{
    amount: Number,
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    method: String,
    details: String,
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

RevenueShareSchema.statics.AD_POINTS = AD_POINTS;
RevenueShareSchema.statics.CHECKIN_POINTS = CHECKIN_POINTS;
RevenueShareSchema.statics.WITHDRAW_GOAL = WITHDRAW_GOAL;
RevenueShareSchema.statics.POINTS_PER_DOLLAR = POINTS_PER_DOLLAR;
RevenueShareSchema.statics.getWeekStart = getWeekStart;

module.exports = mongoose.model("RevenueShare", RevenueShareSchema);
