const express = require("express");
const User = require("../module/Users");
const { auth } = require("../authGoogle/googleAuth");

const router = express.Router();

/* POST /api/social/follow - متابعة مستخدم (أضفني إلى متابعيه) */
router.post("/follow", auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ success: false, message: "معرف المستخدم مطلوب" });

    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const target = await User.findOne({ userId: targetUserId });
    if (!target) return res.status(404).json({ success: false, message: "المستخدم المستهدف غير موجود" });

    if (req.user.id === targetUserId) return res.status(400).json({ success: false, message: "لا يمكن متابعة نفسك" });

    const targetDoc = target;
    if (!targetDoc.followers) targetDoc.followers = [];
    const exists = targetDoc.followers.some((f) => f.userId === req.user.id);
    if (exists) return res.json({ success: true, message: "متابع بالفعل" });

    targetDoc.followers.push({
      userId: req.user.id,
      name: me.name || "—",
      profileImage: me.profileImage || "",
      age: me.age ?? null,
      country: me.country || "",
      gender: me.gender || "",
    });
    await targetDoc.save();

    res.json({ success: true, message: "تمت المتابعة" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* POST /api/social/unfollow - إلغاء المتابعة */
router.post("/unfollow", auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ success: false, message: "معرف المستخدم مطلوب" });

    const target = await User.findOne({ userId: targetUserId });
    if (!target) return res.status(404).json({ success: false, message: "المستخدم المستهدف غير موجود" });

    // إزالة المتابعة من قائمة متابعي المستخدم المستهدف
    if (target.followers) {
      target.followers = target.followers.filter((f) => f.userId !== req.user.id);
      await target.save();
    }

    // إزالة الصداقة من جانبي (يبقى فقط معجب إن كان يتابعني)
    const me = await User.findOne({ userId: req.user.id });
    if (me && me.friends) {
      me.friends = me.friends.filter((f) => f.userId !== targetUserId);
      await me.save();
    }

    res.json({ success: true, message: "تم إلغاء المتابعة" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/social/followers - جلب قائمة المتابعين */
router.get("/followers", auth, async (req, res) => {
  try {
    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const list = (me.followers || []).map((f) => ({
      id: f.userId,
      name: f.name || "—",
      profileImage: f.profileImage || "",
      age: f.age ?? null,
      country: f.country || "",
      gender: f.gender || "",
    }));

    res.json({ success: true, followers: list });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* POST /api/social/friends/accept - قبول طلب صداقة (إضافة من المتابعين إلى الأصدقاء) */
router.post("/friends/accept", auth, async (req, res) => {
  try {
    const { followerUserId } = req.body;
    if (!followerUserId) return res.status(400).json({ success: false, message: "معرف المستخدم مطلوب" });

    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const follower = (me.followers || []).find((f) => f.userId === followerUserId);
    if (!follower) return res.status(400).json({ success: false, message: "هذا المستخدم غير موجود في قائمة المعجبين" });

    if (!me.friends) me.friends = [];
    const alreadyFriend = me.friends.some((f) => f.userId === followerUserId);
    if (alreadyFriend) return res.json({ success: true, message: "صديق بالفعل" });

    me.friends.push({
      userId: follower.userId,
      name: follower.name,
      profileImage: follower.profileImage,
      age: follower.age,
      country: follower.country,
      gender: follower.gender,
    });
    await me.save();

    res.json({ success: true, message: "تم قبول الطلب" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/social/friends - جلب قائمة الأصدقاء */
router.get("/friends", auth, async (req, res) => {
  try {
    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const list = (me.friends || []).map((f) => ({
      id: f.userId,
      name: f.name || "—",
      profileImage: f.profileImage || "",
      age: f.age ?? null,
      country: f.country || "",
      gender: f.gender || "",
    }));

    res.json({ success: true, friends: list });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/social/following - جلب قائمة من أتابعهم */
router.get("/following", auth, async (req, res) => {
  try {
    const meId = req.user.id;
    if (!meId) return res.status(401).json({ success: false, message: "غير مصرح" });

    const users = await User.find({ "followers.userId": meId }).select(
      "userId name profileImage age country gender"
    );

    const list = users.map((u) => ({
      id: u.userId,
      name: u.name || "—",
      profileImage: u.profileImage || "",
      age: u.age ?? null,
      country: u.country || "",
      gender: u.gender || "",
    }));

    res.json({ success: true, following: list });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/social/is-following/:targetUserId - هل أنا أتابع هذا المستخدم؟ */
router.get("/is-following/:targetUserId", auth, async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const target = await User.findOne({ userId: targetUserId });
    if (!target) return res.json({ success: true, isFollowing: false });

    const isFollowing = (target.followers || []).some((f) => f.userId === req.user.id);
    res.json({ success: true, isFollowing });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* POST /api/social/block - حظر مستخدم */
router.post("/block", auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ success: false, message: "معرف المستخدم مطلوب" });

    if (targetUserId === req.user.id) {
      return res.status(400).json({ success: false, message: "لا يمكن حظر نفسك" });
    }

    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const target = await User.findOne({ userId: targetUserId });
    if (!target) return res.status(404).json({ success: false, message: "المستخدم المستهدف غير موجود" });

    if (!me.blocked) me.blocked = [];
    const exists = me.blocked.some((b) => b.userId === targetUserId);
    if (exists) return res.json({ success: true, message: "محظور بالفعل" });

    me.blocked.push({
      userId: target.userId,
      name: target.name || "—",
      profileImage: target.profileImage || "",
      age: target.age ?? null,
      country: target.country || "",
      gender: target.gender || "",
    });

    // عند الحظر يمكن إزالة العلاقة من المتابعين والأصدقاء
    if (me.friends) {
      me.friends = me.friends.filter((f) => f.userId !== targetUserId);
    }
    if (me.followers) {
      me.followers = me.followers.filter((f) => f.userId !== targetUserId);
    }

    await me.save();

    res.json({ success: true, message: "تم حظر المستخدم" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* POST /api/social/unblock - إلغاء حظر مستخدم */
router.post("/unblock", auth, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ success: false, message: "معرف المستخدم مطلوب" });

    const me = await User.findOne({ userId: req.user.id });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    if (me.blocked) {
      me.blocked = me.blocked.filter((b) => b.userId !== targetUserId);
      await me.save();
    }

    res.json({ success: true, message: "تم إلغاء الحظر" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* GET /api/social/blocked - جلب قائمة الحظر (من حظرتهم ومن حظروني) */
router.get("/blocked", auth, async (req, res) => {
  try {
    const meId = req.user.id;
    const me = await User.findOne({ userId: meId });
    if (!me) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    const blockedByMe = me.blocked || [];
    const blockedIds = blockedByMe.map((b) => b.userId);

    const blockedMeUsers = await User.find({ "blocked.userId": meId }).select(
      "userId name profileImage age country gender"
    );

    const blockedMeMap = new Map(
      blockedMeUsers.map((u) => [
        u.userId,
        {
          id: u.userId,
          name: u.name || "—",
          profileImage: u.profileImage || "",
          age: u.age ?? null,
          country: u.country || "",
          gender: u.gender || "",
        },
      ])
    );

    const list = [];

    // من قمت بحظرهم
    for (const b of blockedByMe) {
      const alsoBlockedMe = blockedMeMap.has(b.userId);
      list.push({
        id: b.userId,
        name: b.name || "—",
        profileImage: b.profileImage || "",
        age: b.age ?? null,
        country: b.country || "",
        gender: b.gender || "",
        relation: alsoBlockedMe ? "mutual" : "blocked",
      });
      if (alsoBlockedMe) blockedMeMap.delete(b.userId);
    }

    // من حظروني فقط
    for (const [id, u] of blockedMeMap.entries()) {
      list.push({
        ...u,
        relation: "blocked_me",
      });
    }

    res.json({ success: true, blocked: list });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

module.exports = router;
