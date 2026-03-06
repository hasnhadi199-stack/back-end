const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../module/Users");
const multer = require("multer");
const path = require("path");

const router = express.Router();

/* ========= توليد ID 9 أرقام ========= */
const generateUserId = () => {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
};

/* ================= Multer Config ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads/"), // مجلد رفع الصور
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "جميع الحقول مطلوبة" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "الإيميل مستخدم" });

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      userId: generateUserId(),
      name,
      email,
      password: hashed,
      profileImage: "", // قيمة فارغة مبدئية
    });

    res.json({
      message: "تم التسجيل بنجاح",
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "خطأ بالسيرفر" });
  }
});

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "بيانات غير صحيحة" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "بيانات غير صحيحة" });

    const token = jwt.sign(
      { id: user.userId, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "خطأ بالسيرفر" });
  }
});

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "غير مصرح" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch {
    res.status(401).json({ message: "توكن غير صالح" });
  }
};

/* ================= UPLOAD PROFILE IMAGE ================= */
router.put("/update-profile", auth, async (req, res) => {
  try {
    const { name, age, month, hobby, status } = req.body;
    const user = await User.findOne({ userId: req.user.id });
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

    if (name) user.name = name;
    if (age) user.age = age;
    if (month) user.month = month;
    if (hobby) user.hobby = hobby;
    if (status) user.status = status;

    await user.save();

    res.json({
      message: "تم تحديث البيانات بنجاح",
      user: {
        id: user.userId,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        age: user.age,
        month: user.month,
        hobby: user.hobby,
        status: user.status,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "خطأ بالسيرفر" });
  }
});


function getBaseUrl(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

/* ================= SEARCH USERS BY ID ================= */
router.get("/users/search", auth, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q || q.length < 1)
      return res.status(400).json({ success: false, message: "أدخل معرفاً للبحث" });

    const users = await User.find({
      userId: { $regex: q, $options: "i" },
    })
      .select("userId name profileImage age country gender height weight")
      .limit(30)
      .lean();

    const baseUrl = getBaseUrl(req);

    res.json({
      success: true,
      users: users.map((u) => {
        let profileImage = u.profileImage || "";
        // رابط كامل أو base64 — نرجعه كما هو
        if (profileImage.startsWith("http") || profileImage.startsWith("data:")) {
          // لا تغيير
        } else if (profileImage) {
          profileImage = `${baseUrl}/uploads/${profileImage.replace(/^\//, "")}`;
        }
        return {
          id: u.userId,
          name: u.name,
          profileImage,
          age: u.age,
          country: u.country || "",
          gender: u.gender || "",
          height: u.height ?? null,
          weight: u.weight ?? null,
        };
      }),
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: "خطأ بالسيرفر" });
  }
});

/* ================= GET USER DATA ================= */
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.user.id }).select(
      "userId name email profileImage age month hobby status"
    );
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });

    res.json({
      id: user.userId,
      name: user.name,
      email: user.email,
      profileImage: user.profileImage,
      age: user.age,
      month: user.month,
      hobby: user.hobby,
      status: user.status,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "خطأ بالسيرفر" });
  }
});

module.exports = router;
