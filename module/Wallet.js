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
  transactions: [TransactionSchema],
});

module.exports = mongoose.model("Wallet", WalletSchema);
