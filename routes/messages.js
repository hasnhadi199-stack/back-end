const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const Message = require("../module/Messages");
const User = require("../module/Users");
const { auth } = require("../authGoogle/googleAuth");

const router = express.Router();

// مصادقة عبر query token (للتشغيل الصوتي - expo-av لا يدعم headers)
function authQuery(req, res, next) {
  const token = req.query.token || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "توكن مطلوب" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "توكن منتهي أو غير صالح" });
  }
}

const voiceDir = path.join(__dirname, "../uploads/voice");
if (!fs.existsSync(voiceDir)) fs.mkdirSync(voiceDir, { recursive: true });
const voiceUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, voiceDir),
    filename: (_, __, cb) => cb(null, `voice_${Date.now()}_${Math.random().toString(36).slice(2)}.m4a`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok =
      ["audio/m4a", "audio/mp4", "audio/x-m4a", "audio/aac", "video/mp4"].includes(file.mimetype) ||
      file.originalname?.toLowerCase?.().endsWith?.(".m4a");
    cb(null, !!ok);
  },
});

const imageDir = path.join(__dirname, "../uploads/images");
if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, imageDir),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
      cb(null, `image_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const mime = file.mimetype || "";
    const ok =
      mime.startsWith("image/") ||
      [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].some((ext) =>
        (file.originalname || "").toLowerCase().endsWith(ext)
      );
    cb(null, !!ok);
  },
});

function getBaseUrl(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

// POST /api/messages/upload-voice — رفع بصمة صوت
router.post("/upload-voice", auth, voiceUpload.single("voice"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "الملف مطلوب" });
    const base = getBaseUrl(req);
    const audioUrl = `${base}/uploads/voice/${req.file.filename}`;
    res.json({ success: true, audioUrl });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ في رفع الصوت" });
  }
});

// POST /api/messages/upload-image — رفع صورة رسالة
router.post("/upload-image", auth, imageUpload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "الملف مطلوب" });
    const base = getBaseUrl(req);
    const imageUrl = `${base}/uploads/images/${req.file.filename}`;
    res.json({ success: true, imageUrl });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ في رفع الصورة" });
  }
});

// POST /api/messages/send — إرسال رسالة نصية أو صوتية
router.post("/send", auth, async (req, res) => {
  try {
    const { toUserId, text, replyToText, replyToFromId, audioUrl, audioDurationSeconds, imageUrl } = req.body;
    if (!toUserId) {
      return res.status(400).json({ success: false, message: "المستلم مطلوب" });
    }
    const isVoice = !!audioUrl;
    const isImage = !!imageUrl;
    const textVal = isVoice ? "🎤 رسالة صوتية" : isImage ? "📷 صورة" : text || "";
    if (!isVoice && !isImage && !textVal.trim()) {
      return res.status(400).json({ success: false, message: "النص أو المحتوى مطلوب" });
    }

    const fromId = req.user.id;
    if (fromId === toUserId) {
      return res.status(400).json({ success: false, message: "لا يمكنك إرسال رسالة لنفسك" });
    }

    const [fromUser, toUser] = await Promise.all([
      User.findOne({ userId: fromId }).select("userId name profileImage"),
      User.findOne({ userId: toUserId }).select("userId name profileImage"),
    ]);
    if (!fromUser || !toUser) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    const msg = await Message.create({
      fromId,
      toId: toUserId,
      text: String(textVal).slice(0, 500),
      replyToText: replyToText ? String(replyToText).slice(0, 300) : null,
      replyToFromId: replyToFromId ? String(replyToFromId) : null,
      audioUrl: audioUrl || null,
      audioDurationSeconds: audioDurationSeconds != null ? Number(audioDurationSeconds) : null,
      imageUrl: imageUrl || null,
    });

    // إبقاء آخر 30 رسالة فقط في المحادثة — حذف الأقدم عند تجاوز العدد
    const MAX_MESSAGES = 60;
    const threadMsgs = await Message.find({
      $or: [
        { fromId, toId: toUserId },
        { fromId: toUserId, toId: fromId },
      ],
    })
      .sort({ createdAt: 1 })
      .select("_id")
      .lean();
    if (threadMsgs.length > MAX_MESSAGES) {
      const excess = threadMsgs.length - MAX_MESSAGES;
      const idsToDelete = threadMsgs.slice(0, excess).map((m) => m._id);
      await Message.deleteMany({ _id: { $in: idsToDelete } });
    }

    res.json({
      success: true,
      message: {
        id: msg._id,
        fromId: msg.fromId,
        toId: msg.toId,
        text: msg.text,
        createdAt: msg.createdAt,
        replyToText: msg.replyToText || null,
        replyToFromId: msg.replyToFromId || null,
        audioUrl: msg.audioUrl || null,
        audioDurationSeconds: msg.audioDurationSeconds ?? null,
      },
      from: { id: fromUser.userId, name: fromUser.name, profileImage: fromUser.profileImage || "" },
      to: { id: toUser.userId, name: toUser.name, profileImage: toUser.profileImage || "" },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ في إرسال الرسالة" });
  }
});

// GET /api/messages/inbox — آخر رسالة لكل محادثة تخص المستخدم الحالي
router.get("/inbox", auth, async (req, res) => {
  try {
    const meId = req.user.id;

    const msgs = await Message.find({
      $or: [{ fromId: meId }, { toId: meId }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const lastByPair = new Map();
    for (const m of msgs) {
      const otherId = m.fromId === meId ? m.toId : m.fromId;
      if (!lastByPair.has(otherId)) {
        lastByPair.set(otherId, m);
      }
    }

    const othersIds = Array.from(lastByPair.keys());
    const others = await User.find({ userId: { $in: othersIds } }).select(
      "userId name profileImage"
    );
    const othersMap = new Map(others.map((u) => [u.userId, u]));

    const result = [];
    for (const otherId of othersIds) {
      const m = lastByPair.get(otherId);
      const other = othersMap.get(otherId);
      if (!other) continue;
      result.push({
        id: m._id,
        otherId,
        otherName: other.name || "مستخدم",
        otherProfileImage: other.profileImage || "",
        text: m.imageUrl ? "📷 صورة" : m.audioUrl ? "🎤 رسالة صوتية" : m.text,
        createdAt: m.createdAt,
        direction: m.fromId === meId ? "out" : "in",
      });
    }

    res.json({ success: true, messages: result });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ في جلب الرسائل" });
  }
});

// GET /api/messages/thread/:otherId — كل الرسائل بيني وبين مستخدم معين
router.get("/thread/:otherId", auth, async (req, res) => {
  try {
    const meId = req.user.id;
    const otherId = req.params.otherId;

    const msgs = await Message.find({
      $or: [
        { fromId: meId, toId: otherId },
        { fromId: otherId, toId: meId },
      ],
    })
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      messages: msgs.map((m) => ({
        id: m._id,
        fromId: m.fromId,
        toId: m.toId,
        text: m.text,
        createdAt: m.createdAt,
        replyToText: m.replyToText || null,
        replyToFromId: m.replyToFromId || null,
        audioUrl: m.audioUrl || null,
        audioDurationSeconds: m.audioDurationSeconds ?? null,
        imageUrl: m.imageUrl || null,
      })),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ في جلب المحادثة" });
  }
});

// GET /api/messages/voice/stream/:filename — تدفق الصوت (يُستخدم token في query لـ expo-av)
router.get("/voice/stream/:filename", authQuery, (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename || !/^voice_.+\.m4a$/i.test(filename)) {
    return res.status(400).json({ message: "اسم ملف غير صالح" });
  }
  const filePath = path.join(voiceDir, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "الملف غير موجود" });
  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  const stream = fs.createReadStream(filePath);
  stream.on("error", (err) => {
    if (!res.headersSent) res.status(500).json({ message: "خطأ في القراءة" });
  });
  stream.pipe(res);
});

// DELETE /api/messages/:id — سحب / حذف رسالة من المحادثة
router.delete("/:id", auth, async (req, res) => {
  try {
    const meId = req.user.id;
    const msgId = req.params.id;

    const msg = await Message.findById(msgId);
    if (!msg) {
      return res.status(404).json({ success: false, message: "الرسالة غير موجودة" });
    }
    if (msg.fromId !== meId) {
      return res.status(403).json({ success: false, message: "لا يمكنك حذف رسالة ليست لك" });
    }

    await Message.deleteOne({ _id: msgId });
    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ في حذف الرسالة" });
  }
});

module.exports = router;

