/**
 * زواري — تسجيل وعرض من زار بروفايلك
 * POST /api/profile-visits/record — تسجيل زيارة بروفايل
 * GET  /api/profile-visits — جلب قائمة الزوار
 */
const express = require("express");
const User = require("../module/Users");
const { auth } = require("../authGoogle/googleAuth");

const router = express.Router();

/* POST /api/profile-visits/record — تسجيل أن المستخدم الحالي زار بروفايل profileUserId */
router.post("/record", auth, async (req, res) => {
  try {
    const { profileUserId } = req.body;
    if (!profileUserId) return res.status(400).json({ success: false, message: "معرف البروفايل مطلوب" });

    const visitorId = req.user.id;
    if (visitorId === profileUserId) return res.json({ success: true, message: "لا تسجل زيارة نفسك" });

    const visitor = await User.findOne({ userId: visitorId });
    if (!visitor) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const profileOwner = await User.findOne({ userId: profileUserId });
    if (!profileOwner) return res.status(404).json({ success: false, message: "البروفايل غير موجود" });

    if (!profileOwner.profileVisitors) profileOwner.profileVisitors = [];

    const existing = profileOwner.profileVisitors.findIndex((v) => v.userId === visitorId);
    const visitorEntry = {
      userId: visitor.userId,
      name: visitor.name || "—",
      profileImage: visitor.profileImage || "",
      age: visitor.age ?? null,
      country: visitor.country || "",
      gender: visitor.gender || "",
      visitedAt: new Date(),
    };

    if (existing >= 0) {
      profileOwner.profileVisitors[existing] = visitorEntry;
    } else {
      profileOwner.profileVisitors.unshift(visitorEntry);
    }

    // حد أقصى 100 زائر (الأحدث أولاً)
    if (profileOwner.profileVisitors.length > 100) {
      profileOwner.profileVisitors = profileOwner.profileVisitors.slice(0, 100);
    }

    await profileOwner.save();

    res.json({ success: true, message: "تم تسجيل الزيارة" });
  } catch (err) {
    console.error("profileVisits record error:", err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/profile-visits — جلب قائمة من زاروا بروفايلي (الأحدث أولاً) */
router.get("/", auth, async (req, res) => {
  try {
    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const list = (me.profileVisitors || []).map((v) => ({
      id: v.userId,
      name: v.name || "—",
      profileImage: v.profileImage || "",
      age: v.age ?? null,
      country: v.country || "",
      gender: v.gender || "",
      visitedAt: v.visitedAt,
    }));

    res.json({ success: true, visitors: list });
  } catch (err) {
    console.error("profileVisits list error:", err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

module.exports = router;
