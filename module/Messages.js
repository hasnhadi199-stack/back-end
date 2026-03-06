const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    fromId: { type: String, required: true }, // userId للمرسل
    toId: { type: String, required: true },   // userId للمستلم
    text: { type: String, default: "" },      // فارغ لرسالة صوتية
    replyToText: { type: String, default: null },
    replyToFromId: { type: String, default: null },
    audioUrl: { type: String, default: null },
    audioDurationSeconds: { type: Number, default: null },
    imageUrl: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", MessageSchema);

