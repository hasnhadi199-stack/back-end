const express = require("express");
const Wallet = require("../module/Wallet");
const { auth } = require("../authGoogle/googleAuth");

const router = express.Router();

// GET /api/wallet — جلب رصيد الذهب للمستخدم المسجّل
router.get("/wallet", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        totalGold: 0,
        chargedGold: 0,
        freeGold: 0,
        transactions: [],
      });
    }
    res.json({
      success: true,
      wallet: {
        totalGold: wallet.totalGold,
        chargedGold: wallet.chargedGold,
        freeGold: wallet.freeGold,
      },
    });
  } catch (err) {
    console.error("GET /wallet error:", err);
    res.status(500).json({ success: false, message: "خطأ في جلب الرصيد" });
  }
});

// POST /api/wallet/topup — إضافة ذهب من عملية شراء
router.post("/wallet/topup", auth, async (req, res) => {
  try {
    const { amount, bonus } = req.body;
    if (typeof amount !== "number" || amount < 0) {
      return res.status(400).json({ success: false, message: "قيمة غير صالحة" });
    }
    const bonusAmount = typeof bonus === "number" ? Math.round(bonus) : 0;

    const userId = req.user.id;
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = await Wallet.create({
        userId,
        totalGold: 0,
        chargedGold: 0,
        freeGold: 0,
        transactions: [],
      });
    }

    const newCharged = wallet.chargedGold + amount;
    const newFree = wallet.freeGold + bonusAmount;
    const newTotal = wallet.totalGold + amount + bonusAmount;

    wallet.chargedGold = newCharged;
    wallet.freeGold = newFree;
    wallet.totalGold = newTotal;
    wallet.transactions.push({ amount, bonus: bonusAmount, createdAt: new Date() });
    await wallet.save();

    res.json({
      success: true,
      wallet: {
        totalGold: wallet.totalGold,
        chargedGold: wallet.chargedGold,
        freeGold: wallet.freeGold,
      },
    });
  } catch (err) {
    console.error("POST /wallet/topup error:", err);
    res.status(500).json({ success: false, message: "خطأ في شحن الرصيد" });
  }
});

module.exports = router;
