const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const { AccessToken } = require("livekit-server-sdk");
const GroupChatMessage = require("../module/GroupChatMessage");
const GroupChatVisitor = require("../module/GroupChatVisitor");
const User = require("../module/Users");
const Wallet = require("../module/Wallet");
const { auth } = require("../authGoogle/googleAuth");
const { getBaseUrl } = require("../utils/push");

const router = express.Router();

const ROOM_NAME = "group-chat-room";

// in-memory store for slots and room membership (replace with Redis in production)
const slots = new Map(); // slotIndex -> { userId, name, profileImage, ... }
const roomMembers = new Set(); // userId

// حالة الموسيقى المشتركة — تُبث لجميع المستخدمين
let musicState = {
  url: null,
  isPlaying: false,
  playlist: [],
  currentIndex: 0,
  volume: 1,
  updatedAt: 0,
};

const musicDir = path.join(__dirname, "../uploads/music");
if (!fs.existsSync(musicDir)) fs.mkdirSync(musicDir, { recursive: true });
const musicUpload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, musicDir),
    filename: (_, __, cb) => cb(null, `song_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok =
      ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/x-m4a", "audio/aac"].includes(file.mimetype) ||
      (file.originalname || "").toLowerCase().match(/\.(mp3|m4a|aac)$/);
    cb(null, !!ok);
  },
});

const MAX_VISITORS = 100;
const MAX_MESSAGES = 250;
/** رسالة دخول للدردشة — يُعرض في التطبيق كـ: قادم [الاسم] */
const JOIN_MESSAGE_TEXT = "__join__";
/** أظهر إعلان الدخول كل مرة (حسب طلب التطبيق) */
const JOIN_ANNOUNCE_MIN_GAP_MS = 0;

// POST /api/group-chat/join — استجابة فورية (تنظيف الزوار في الخلفية)
router.post("/group-chat/join", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    roomMembers.add(userId);

    const prevVisitor = await GroupChatVisitor.findOne({ userId }).select("lastJoinedAt").lean();
    const user = await User.findOne({ userId }).select("userId name profileImage gender age").lean();
    await GroupChatVisitor.findOneAndUpdate(
      { userId },
      {
        userId,
        name: user?.name ?? "مستخدم",
        profileImage: user?.profileImage ?? null,
        gender: user?.gender ?? null,
        lastJoinedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const now = Date.now();
    const lastT = prevVisitor?.lastJoinedAt ? new Date(prevVisitor.lastJoinedAt).getTime() : 0;
    const shouldAnnounceJoin = !prevVisitor || now - lastT > JOIN_ANNOUNCE_MIN_GAP_MS;

    if (shouldAnnounceJoin) {
      try {
        await GroupChatMessage.create({
          fromId: userId,
          fromName: user?.name ?? "مستخدم",
          fromProfileImage: user?.profileImage ?? null,
          fromAge: user?.age ?? null,
          fromGender: user?.gender ?? null,
          text: JOIN_MESSAGE_TEXT,
        });
        const cnt = await GroupChatMessage.countDocuments();
        if (cnt > MAX_MESSAGES) {
          const excess = cnt - MAX_MESSAGES;
          const oldest = await GroupChatMessage.find().sort({ createdAt: 1 }).limit(excess).select("_id").lean();
          if (oldest.length) await GroupChatMessage.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
        }
        messagesCache = { data: [], ts: 0 };
      } catch (e) {
        console.error("group-chat join announcement:", e?.message);
      }
    }

    usersCache = { data: null, ts: 0 };
    res.json({ success: true });

    setImmediate(async () => {
      try {
        const count = await GroupChatVisitor.countDocuments();
        if (count > MAX_VISITORS) {
          const toDelete = await GroupChatVisitor.find().sort({ lastJoinedAt: 1 }).limit(count - MAX_VISITORS).select("_id").lean();
          if (toDelete.length) await GroupChatVisitor.deleteMany({ _id: { $in: toDelete.map((v) => v._id) } });
        }
      } catch (e) {
        console.error("group-chat visitor cleanup:", e?.message);
      }
    });
  } catch (err) {
    console.error("group-chat join error:", err);
    res.status(500).json({ success: false, message: "خطأ في الانضمام" });
  }
});

// POST /api/group-chat/leave — لا نحذف من قائمة "all"، يبقى المستخدم في القائمة
router.post("/group-chat/leave", auth, async (req, res) => {
  try {
    roomMembers.delete(req.user.id);
    for (const [idx, data] of slots.entries()) {
      if (data && data.userId === req.user.id) {
        slots.delete(idx);
        break;
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("group-chat leave error:", err);
    res.status(500).json({ success: false, message: "خطأ في المغادرة" });
  }
});

// POST /api/group-chat/slot — take or release slot
router.post("/group-chat/slot", auth, async (req, res) => {
  try {
    const { slotIndex, action } = req.body;
    const meId = req.user.id;

    if (action === "release") {
      for (const [idx, data] of slots.entries()) {
        if (data && data.userId === meId) {
          slots.delete(idx);
          break;
        }
      }
    } else if (action === "take" && typeof slotIndex === "number" && slotIndex >= 0 && slotIndex < 8) {
      for (const [idx] of slots.entries()) {
        if (slots.get(idx)?.userId === meId) slots.delete(idx);
      }
      const me = await User.findOne({ userId: meId }).select("userId name profileImage").lean();
      const wallet = await Wallet.findOne({ userId: meId }).select("totalGold chargedGold diamonds").lean();
      slots.set(slotIndex, {
        userId: meId,
        name: me?.name || "مستخدم",
        profileImage: me?.profileImage || null,
        totalGold: wallet?.totalGold ?? 0,
        chargedGold: wallet?.chargedGold ?? 0,
        diamonds: wallet?.diamonds ?? 0,
      });
    }

    const result = [];
    for (let i = 0; i < 8; i++) {
      const d = slots.get(i);
      result.push(d ? { slotIndex: i, ...d } : null);
    }
    res.json({ success: true, slots: result });
  } catch (err) {
    console.error("group-chat slot error:", err);
    res.status(500).json({ success: false, message: "خطأ في الشقة" });
  }
});

// GET /api/group-chat/slots
router.get("/group-chat/slots", auth, async (req, res) => {
  try {
    const result = [];
    for (let i = 0; i < 8; i++) {
      const d = slots.get(i);
      result.push(d ? { slotIndex: i, ...d } : null);
    }
    res.json({ success: true, slots: result });
  } catch (err) {
    console.error("group-chat slots error:", err);
    res.status(500).json({ success: false, message: "خطأ في جلب الشقق" });
  }
});

let usersCache = { data: null, ts: 0 };
const USERS_CACHE_TTL = 2200;

// GET /api/group-chat/users — قائمة "all" مع cache
router.get("/group-chat/users", auth, async (req, res) => {
  if (usersCache.data && Date.now() - usersCache.ts < USERS_CACHE_TTL) {
    return res.json(usersCache.data);
  }
  try {
    const visitors = await GroupChatVisitor.find()
      .sort({ lastJoinedAt: -1 })
      .limit(MAX_VISITORS)
      .select("userId name profileImage gender")
      .lean();
    const list = visitors.map((v) => ({
      userId: v.userId,
      name: v.name || "مستخدم",
      profileImage: v.profileImage || null,
      gender: v.gender || null,
    }));
    const payload = { success: true, users: list };
    usersCache = { data: payload, ts: Date.now() };
    res.json(payload);
  } catch (err) {
    console.error("group-chat users error:", err);
    res.status(500).json({ success: false, message: "خطأ في جلب المستخدمين" });
  }
});

// GET /api/group-chat/voice-token
router.get("/group-chat/voice-token", auth, async (req, res) => {
  try {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_WS_URL || "wss://your-livekit-server.livekit.cloud";

    if (!apiKey || !apiSecret) {
      return res.status(503).json({ success: false, message: "LiveKit غير مُعد" });
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: req.user.id,
      name: req.user.id,
    });
    at.addGrant({ roomJoin: true, room: ROOM_NAME, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    res.json({ success: true, token, wsUrl });
  } catch (err) {
    console.error("group-chat voice-token error:", err);
    res.status(500).json({ success: false, message: "خطأ في الحصول على توكن الصوت" });
  }
});

// GET /api/group-chat/music-state — جلب حالة الموسيقى (للجميع)
router.get("/group-chat/music-state", auth, (req, res) => {
  res.json({ success: true, ...musicState });
});

// POST /api/group-chat/music-control — تشغيل/إيقاف/التالي/السابق/الصوت
router.post("/group-chat/music-control", auth, (req, res) => {
  try {
    const { action, url, volume } = req.body;
    const base = getBaseUrl(req);

    if (action === "play" && url) {
      const fullUrl = url.startsWith("http") ? url : `${base}${url.startsWith("/") ? "" : "/"}${url}`;
      if (!musicState.playlist.length) musicState.playlist = [fullUrl];
      else if (!musicState.playlist.includes(fullUrl)) musicState.playlist.push(fullUrl);
      musicState.currentIndex = musicState.playlist.indexOf(fullUrl);
      musicState.url = fullUrl;
      musicState.isPlaying = true;
      musicState.updatedAt = Date.now();
    } else if (action === "stop") {
      musicState.isPlaying = false;
      musicState.url = null;
      musicState.updatedAt = Date.now();
    } else if (action === "next" && musicState.playlist.length > 0) {
      musicState.currentIndex = (musicState.currentIndex + 1) % musicState.playlist.length;
      musicState.url = musicState.playlist[musicState.currentIndex];
      musicState.isPlaying = true;
      musicState.updatedAt = Date.now();
    } else if (action === "prev" && musicState.playlist.length > 0) {
      musicState.currentIndex = (musicState.currentIndex - 1 + musicState.playlist.length) % musicState.playlist.length;
      musicState.url = musicState.playlist[musicState.currentIndex];
      musicState.isPlaying = true;
      musicState.updatedAt = Date.now();
    } else if (action === "volume" && typeof volume === "number") {
      musicState.volume = Math.max(0, Math.min(1, volume));
      musicState.updatedAt = Date.now();
    }

    res.json({ success: true, ...musicState });
  } catch (err) {
    console.error("music-control error:", err);
    res.status(500).json({ success: false });
  }
});

// POST /api/group-chat/upload-music
router.post("/group-chat/upload-music", auth, musicUpload.single("music"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "الملف مطلوب" });
    const base = getBaseUrl(req);
    const musicUrl = `${base}/uploads/music/${req.file.filename}`;
    res.json({ success: true, musicUrl });
  } catch (err) {
    console.error("group-chat upload-music error:", err);
    res.status(500).json({ success: false, message: "خطأ في رفع الأغنية" });
  }
});

// تخزين مؤقت — استجابة فورية عند الطلبات المتكررة
let messagesCache = { data: [], ts: 0 };
/** تخزين مؤقت للاستجابة — يقلل ضربات Mongo عند استطلاع عدة عملاء (لا علاقة لحجم DB بالبطء) */
const CACHE_TTL_MS = 1400;

// GET /api/group-chat/messages — جلب رسائل الدردشة الجماعية
router.get("/group-chat/messages", auth, async (req, res) => {
  const now = Date.now();
  if (messagesCache.data.length > 0 && now - messagesCache.ts < CACHE_TTL_MS) {
    return res.json({ success: true, messages: messagesCache.data });
  }
  try {
    const limit = 250;
    /** آخر N رسالة: ترتيب تنازلي ثم عكس — أسرع وأصح عندما يتجاوز العدد الحد الأقصى مؤقتًا */
    const msgs = await GroupChatMessage.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("fromId fromName fromProfileImage fromAge fromGender fromDiamonds fromChargedGold toId giftRecipients text createdAt replyToText replyToFromId replyToFromName audioUrl audioDurationSeconds imageUrl")
      .lean();
    msgs.reverse();

    const fromIds = [...new Set(msgs.map((m) => m.fromId))];
    const [users, wallets] = await Promise.all([
      fromIds.length ? User.find({ userId: { $in: fromIds } }).select("userId name profileImage age gender").lean() : [],
      fromIds.length ? Wallet.find({ userId: { $in: fromIds } }).select("userId diamonds chargedGold").lean() : [],
    ]);
    const userMap = new Map(users.map((u) => [u.userId, u]));
    const walletMap = new Map(wallets.map((w) => [w.userId, w]));

    const result = msgs.map((m) => {
      const u = userMap.get(m.fromId);
      const w = walletMap.get(m.fromId);
      const diamonds = m.fromDiamonds ?? w?.diamonds ?? 0;
      const chargedGold = m.fromChargedGold ?? w?.chargedGold ?? 0;
      return {
        id: m._id,
        fromId: m.fromId,
        fromName: m.fromName || u?.name || "مستخدم",
        fromProfileImage: m.fromProfileImage ?? u?.profileImage ?? null,
        fromAge: m.fromAge ?? u?.age ?? null,
        fromGender: m.fromGender ?? u?.gender ?? null,
        fromDiamonds: diamonds,
        fromChargedGold: chargedGold,
        toId: m.toId ?? null,
        giftRecipients: Array.isArray(m.giftRecipients) ? m.giftRecipients : [],
        text: m.text,
        createdAt: m.createdAt,
        replyToText: m.replyToText ?? null,
        replyToFromId: m.replyToFromId ?? null,
        replyToFromName: m.replyToFromName ?? null,
        audioUrl: m.audioUrl ?? null,
        audioDurationSeconds: m.audioDurationSeconds ?? null,
        imageUrl: m.imageUrl ?? null,
      };
    });

    messagesCache = { data: result, ts: Date.now() };
    res.json({ success: true, messages: result });
  } catch (err) {
    if (messagesCache.data.length > 0) {
      return res.json({ success: true, messages: messagesCache.data });
    }
    res.json({ success: true, messages: [] });
  }
});

// POST /api/group-chat/send — إرسال رسالة في الدردشة الجماعية (تُحفظ في MongoDB ويراها الجميع)
router.post("/group-chat/send", auth, async (req, res) => {
  try {
    const {
      text,
      audioUrl,
      audioDurationSeconds,
      imageUrl,
      toId,
      toIds,
      giftAmount,
      replyToText,
      replyToFromId,
      replyToFromName,
    } = req.body;

    const fromId = req.user.id;
    const isVoice = !!audioUrl;
    const isImage = !!imageUrl;
    const isGift = !!(giftAmount && Number(giftAmount) > 0);
    const textVal = isVoice ? "🎤 رسالة صوتية" : isImage ? "📷 صورة" : isGift ? (text || "").trim() : (text || "").trim();
    if (!isVoice && !isImage && !textVal) {
      return res.status(400).json({ success: false, message: "النص أو المحتوى مطلوب" });
    }

    let recipientIds = Array.isArray(toIds) && toIds.length > 0 ? toIds : (toId ? [toId] : []);
    const isGiftToAll = isGift && recipientIds.length === 0;

    if (isGiftToAll) {
      const visitors = await GroupChatVisitor.find().sort({ lastJoinedAt: -1 }).limit(MAX_VISITORS).select("userId").lean();
      recipientIds = visitors.map((v) => v.userId).filter((uid) => uid !== fromId);
    }

    const recipientCount = Math.max(1, recipientIds.length);
    let totalCost = Number(giftAmount) > 0 ? Number(giftAmount) * recipientCount : 0;

    if (isGift && Number(giftAmount) > 0) {
      const giftMatch = String(textVal).match(/^GIFT:([^:]+):(\d+)$/);
      if (giftMatch) {
        const amount = parseInt(giftMatch[2], 10);
        const giftType = giftMatch[1];
        if (Number.isFinite(amount) && amount > 0) {
          let distribList = [];
          if (isGiftToAll && recipientIds.length > 0) {
            const shuffled = [...recipientIds].sort(() => Math.random() - 0.5);
            const n = shuffled.length;
            if (n === 1) {
              distribList = [{ userId: shuffled[0], amt: amount }];
            } else if (n === 2) {
              const half = Math.floor(amount / 2);
              const rest = amount - half;
              distribList = [
                { userId: shuffled[0], amt: half },
                { userId: shuffled[1], amt: rest },
              ];
            } else if (n <= amount) {
              const per = Math.floor(amount / n);
              const rem = amount % n;
              distribList = shuffled.map((uid, i) => ({
                userId: uid,
                amt: per + (i < rem ? 1 : 0),
              }));
            } else {
              const picks = shuffled.slice(0, amount);
              distribList = picks.map((uid) => ({ userId: uid, amt: 1 }));
            }
            totalCost = amount;
          } else {
            totalCost = amount * recipientCount;
          }
          let senderWallet = await Wallet.findOne({ userId: fromId });
          if (!senderWallet) {
            senderWallet = await Wallet.create({
              userId: fromId,
              totalGold: 0,
              chargedGold: 0,
              freeGold: 0,
              diamonds: 0,
              transactions: [],
            });
          }
          const totalAvail = (senderWallet.chargedGold ?? 0) + (senderWallet.freeGold ?? 0);
          if (totalAvail < totalCost) {
            return res.status(400).json({ success: false, message: "رصيدك من الذهب غير كافٍ لإرسال الهدية" });
          }
          const charged = senderWallet.chargedGold ?? 0;
          const free = senderWallet.freeGold ?? 0;
          const takeFromCharged = Math.min(charged, totalCost);
          const takeFromFree = totalCost - takeFromCharged;
          senderWallet.chargedGold = charged - takeFromCharged;
          senderWallet.freeGold = free - takeFromFree;
          senderWallet.totalGold = senderWallet.chargedGold + senderWallet.freeGold;
          const senderDiamonds = Math.round(totalCost * 0.001 * 100) / 100;
          senderWallet.diamonds = Math.round(((senderWallet.diamonds ?? 0) + senderDiamonds) * 100) / 100;
          await senderWallet.save();

          if (isGiftToAll && distribList.length > 0) {
            const fromUser = await User.findOne({ userId: fromId }).select("userId name profileImage age gender").lean();
            if (!fromUser) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
            let fromDiamonds = null;
            let fromChargedGold = null;
            const wallet = await Wallet.findOne({ userId: fromId });
            if (wallet) {
              fromDiamonds = wallet.diamonds ?? 0;
              fromChargedGold = wallet.chargedGold ?? 0;
            }
            const users = await User.find({ userId: { $in: distribList.map((d) => d.userId) } }).select("userId name profileImage").lean();
            const userMap = new Map(users.map((u) => [u.userId, u]));
            const msgs = [];
            for (const { userId: uid, amt } of distribList) {
              if (amt <= 0) continue;
              const u = userMap.get(uid);
              const giftText = `GIFT:${giftType}:${amt}`;
              const m = await GroupChatMessage.create({
                fromId,
                fromName: fromUser.name || "مستخدم",
                fromProfileImage: fromUser.profileImage || null,
                fromAge: fromUser.age ?? null,
                fromGender: fromUser.gender ?? null,
                fromDiamonds,
                fromChargedGold,
                toId: uid,
                giftRecipients: [{ userId: uid, name: u?.name || "مستخدم", profileImage: u?.profileImage ?? null }],
                text: giftText,
                replyToText: replyToText ? String(replyToText).slice(0, 300) : null,
                replyToFromId: replyToFromId ? String(replyToFromId).slice(0, 300) : null,
                replyToFromName: replyToFromName ? String(replyToFromName).slice(0, 100) : null,
                audioUrl: null,
                audioDurationSeconds: null,
                imageUrl: null,
              });
              msgs.push({
                id: m._id,
                fromId: m.fromId,
                fromName: m.fromName,
                fromProfileImage: m.fromProfileImage,
                fromAge: m.fromAge,
                fromGender: m.fromGender,
                fromDiamonds: m.fromDiamonds,
                fromChargedGold: m.fromChargedGold,
                toId: m.toId,
                giftRecipients: m.giftRecipients || [],
                text: m.text,
                createdAt: m.createdAt,
                replyToText: m.replyToText,
                replyToFromId: m.replyToFromId,
                replyToFromName: m.replyToFromName,
                audioUrl: m.audioUrl,
                audioDurationSeconds: m.audioDurationSeconds,
                imageUrl: m.imageUrl,
              });
            }
            const cnt = await GroupChatMessage.countDocuments();
            if (cnt > MAX_MESSAGES) {
              const excess = cnt - MAX_MESSAGES;
              const oldest = await GroupChatMessage.find().sort({ createdAt: 1 }).limit(excess).select("_id").lean();
              if (oldest.length) await GroupChatMessage.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
            }
            messagesCache = { data: [], ts: 0 };
            return res.json({ success: true, messages: msgs });
          }
        }
      }
    }

    const fromUser = await User.findOne({ userId: fromId }).select("userId name profileImage age gender").lean();
    if (!fromUser) return res.status(404).json({ success: false, message: "المستخدم غير موجود" });

    let fromDiamonds = null;
    let fromChargedGold = null;
    if (giftAmount && Number(giftAmount) > 0) {
      const wallet = await Wallet.findOne({ userId: fromId });
      if (wallet) {
        fromDiamonds = wallet.diamonds ?? 0;
        fromChargedGold = wallet.chargedGold ?? 0;
      }
    }

    let giftRecipients = [];
    if (recipientIds.length > 0) {
      const users = await User.find({ userId: { $in: recipientIds } }).select("userId name profileImage").lean();
      const userMap = new Map(users.map((u) => [u.userId, u]));
      giftRecipients = recipientIds.map((uid) => {
        const u = userMap.get(uid);
        return { userId: uid, name: u?.name || "مستخدم", profileImage: u?.profileImage ?? null };
      });
    }

    const msg = await GroupChatMessage.create({
      fromId,
      fromName: fromUser.name || "مستخدم",
      fromProfileImage: fromUser.profileImage || null,
      fromAge: fromUser.age ?? null,
      fromGender: fromUser.gender || null,
      fromDiamonds,
      fromChargedGold,
      toId: recipientIds[0] || null,
      giftRecipients,
      text: String(textVal).slice(0, 500),
      replyToText: replyToText ? String(replyToText).slice(0, 300) : null,
      replyToFromId: replyToFromId ? String(replyToFromId) : null,
      replyToFromName: replyToFromName ? String(replyToFromName).slice(0, 100) : null,
      audioUrl: audioUrl || null,
      audioDurationSeconds: audioDurationSeconds != null ? Number(audioDurationSeconds) : null,
      imageUrl: imageUrl || null,
    });

    const MAX_MESSAGES = 250;
    const count = await GroupChatMessage.countDocuments();
    if (count > MAX_MESSAGES) {
      const excess = count - MAX_MESSAGES;
      const oldest = await GroupChatMessage.find().sort({ createdAt: 1 }).limit(excess).select("_id").lean();
      if (oldest.length) await GroupChatMessage.deleteMany({ _id: { $in: oldest.map((o) => o._id) } });
    }

    messagesCache = { data: [], ts: 0 };

    res.json({
      success: true,
      message: {
        id: msg._id,
        fromId: msg.fromId,
        fromName: msg.fromName,
        fromProfileImage: msg.fromProfileImage,
        fromAge: msg.fromAge,
        fromGender: msg.fromGender,
        fromDiamonds: msg.fromDiamonds,
        fromChargedGold: msg.fromChargedGold,
        toId: msg.toId,
        giftRecipients: msg.giftRecipients || [],
        text: msg.text,
        createdAt: msg.createdAt,
        replyToText: msg.replyToText,
        replyToFromId: msg.replyToFromId,
        replyToFromName: msg.replyToFromName,
        audioUrl: msg.audioUrl,
        audioDurationSeconds: msg.audioDurationSeconds,
        imageUrl: msg.imageUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "خطأ في إرسال الرسالة" });
  }
});

// DELETE /api/group-chat/messages/:id — حذف رسالة (للمرسل فقط)
router.delete("/group-chat/messages/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const meId = req.user.id;
    const msg = await GroupChatMessage.findById(id);
    if (!msg) return res.status(404).json({ success: false, message: "الرسالة غير موجودة" });
    if (msg.fromId !== meId) return res.status(403).json({ success: false, message: "لا يمكنك حذف رسالة غيرك" });
    await GroupChatMessage.findByIdAndDelete(id);
    messagesCache = { data: [], ts: 0 };
    res.json({ success: true });
  } catch (err) {
    console.error("delete group-chat message error:", err);
    res.status(500).json({ success: false, message: "خطأ في الحذف" });
  }
});

module.exports = router;
