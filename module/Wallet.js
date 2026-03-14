const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  bonus: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const WalletSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  totalGold: { type: Number, default: 0 },
  chargedGold: { type: Number, default: 0 },
  freeGold: { type: Number, default: 0 },
  diamonds: { type: Number, default: 0 }, // أرباح من الهدايا المستلمة (45% من القيمة)
  transactions: [TransactionSchema],
  lastFiveMessagesClaim: { type: Date, default: null }, // آخر استلام لمكافأة 5 رسائل
  lastShareMomentClaim: { type: Date, default: null }, // آخر استلام لمكافأة نشر لحظة
  lastAddFriendClaim: { type: Date, default: null }, // آخر استلام لمكافأة إضافة صديق
  lastDiceClaim: { type: Date, default: null }, // آخر استلام لمكافأة 5 نرد
});

module.exports = mongoose.model("Wallet", WalletSchema);
