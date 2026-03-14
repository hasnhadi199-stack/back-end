/**
 * إعجاب البروفايل
 * POST /api/profile/like — إعجاب ببروفايل مستخدم (مرة واحدة)
 * GET  /api/profile/likes/:userId — عدد الإعجابات وحالة إعجابي
 * GET  /api/profile/likes/:userId/list — قائمة من أعجبوا بصفحتي
 */
const express = require("express");
const User = require("../module/Users");
const { auth } = require("../authGoogle/googleAuth");

const router = express.Router();

/* POST /api/profile/like — المستخدم الحالي يعجب ببروفايل targetUserId */
router.post("/like", auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ success: false, message: "معرف البروفايل مطلوب" });

    const likerId = req.user.id;
    if (likerId === targetUserId) return res.status(400).json({ success: false, message: "لا تعجب بصفحتك" });

    const liker = await User.findOne({ userId: likerId });
    if (!liker) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const profileOwner = await User.findOne({ userId: targetUserId });
    if (!profileOwner) return res.status(404).json({ success: false, message: "البروفايل غير موجود" });

    if (!profileOwner.profileLikedBy) profileOwner.profileLikedBy = [];

    const existing = profileOwner.profileLikedBy.findIndex((p) => p.userId === likerId);
    if (existing >= 0) {
      return res.json({
        success: true,
        likeCount: profileOwner.profileLikedBy.length,
        alreadyLiked: true,
      });
    }

    const likerEntry = {
      userId: liker.userId,
      name: liker.name || "—",
      profileImage: liker.profileImage || "",
      age: liker.age ?? null,
      country: liker.country || "",
      gender: liker.gender || "",
      location: liker.hobby || liker.status || "",
      likedAt: new Date(),
    };

    profileOwner.profileLikedBy.push(likerEntry);

    if (profileOwner.profileLikedBy.length > 500) {
      profileOwner.profileLikedBy = profileOwner.profileLikedBy.slice(-500);
    }

    await profileOwner.save();

    res.json({
      success: true,
      likeCount: profileOwner.profileLikedBy.length,
      alreadyLiked: false,
    });
  } catch (err) {
    console.error("POST /api/profile/like error:", err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/profile/likes/:userId/list — قائمة من أعجبوا بصفحتي (يجب أن يكون قبل /likes/:userId) */
router.get("/likes/:userId/list", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const profileOwner = await User.findOne({ userId });
    if (!profileOwner) return res.status(404).json({ success: false, message: "البروفايل غير موجود" });

    if (profileOwner.userId !== currentUserId) {
      return res.status(403).json({ success: false, message: "غير مصرح بعرض قائمة المعجبين" });
    }

    const list = (profileOwner.profileLikedBy || []).map((p) => ({
      id: p.userId,
      userId: p.userId,
      name: p.name || "—",
      profileImage: p.profileImage || "",
      avatar: p.profileImage || "",
      age: p.age ?? null,
      country: p.country || "",
      gender: p.gender || "",
      location: p.location || "",
      city: p.location || "",
    }));

    res.json({ success: true, users: list });
  } catch (err) {
    console.error("GET /api/profile/likes/:userId/list error:", err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/profile/likes/:userId — عدد الإعجابات وحالة إعجابي */
router.get("/likes/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const profileOwner = await User.findOne({ userId });
    if (!profileOwner) return res.status(404).json({ success: false, message: "البروفايل غير موجود" });

    const list = profileOwner.profileLikedBy || [];
    const likeCount = list.length;
    const likedByMe = list.some((p) => p.userId === currentUserId);

    res.json({ success: true, likeCount, likedByMe });
  } catch (err) {
    console.error("GET /api/profile/likes/:userId error:", err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

module.exports = router;
