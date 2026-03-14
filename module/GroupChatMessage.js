const mongoose = require("mongoose");

const GroupChatMessageSchema = new mongoose.Schema(
  {
    roomId: { type: String, default: "main" },
    fromId: { type: String, required: true },
    fromName: { type: String, default: "" },
    fromProfileImage: { type: String, default: null },
    toId: { type: String, default: null }, // للمستلم عند إرسال هدية
    text: { type: String, default: "" },
    audioUrl: { type: String, default: null },
    audioDurationSeconds: { type: Number, default: null },
    imageUrl: { type: String, default: null },
  },
  { timestamps: true }
);

GroupChatMessageSchema.index({ roomId: 1, createdAt: -1 });

module.exports = mongoose.model("GroupChatMessage", GroupChatMessageSchema);
