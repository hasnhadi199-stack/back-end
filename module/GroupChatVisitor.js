const mongoose = require("mongoose");

const GroupChatVisitorSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    name: { type: String, default: "مستخدم" },
    profileImage: { type: String, default: null },
    gender: { type: String, default: null },
    lastJoinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

GroupChatVisitorSchema.index({ lastJoinedAt: -1 });

module.exports = mongoose.model("GroupChatVisitor", GroupChatVisitorSchema);
