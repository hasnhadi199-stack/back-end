const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// Trust proxy (for localtunnel/ngrok)
app.set("trust proxy", true);

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: "*", // في الإنتاج ضع domain محدد
  credentials: true,
}));

// Routes
const authRoutes = require("./authGoogle/authGoogle");
const { router: googleAuthRouter } = require("./authGoogle/googleAuth");
const momentsRouter = require("./routes/moments");
const walletRouter = require("./routes/wallet");
const socialRouter = require("./routes/social");
const messagesRouter = require("./routes/messages");

app.use("/api", authRoutes); // Routes القديمة (register, login, etc.)
app.use("/api", googleAuthRouter); // Google OAuth routes
app.use("/api", momentsRouter); // اللحظات (صور وفيديو حتى 20 ثانية)
app.use("/api", walletRouter);
app.use("/api/social", socialRouter); // المتابعين والأصدقاء // المحفظة والذهب
app.use("/api/messages", messagesRouter);

// Static files
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

mongoose.connect("mongodb://127.0.0.1:27017/mydb")
    .then(() => console.log('MongoDB Connected ✅'))
.catch((err)=> console.log('MongoDB Error ❌', err))

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000')
})