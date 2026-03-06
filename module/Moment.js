const mongoose = require("mongoose");

const MomentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, required: true },
  userAge: { type: Number, default: null },
  userGender: { type: String, default: "" },
  userCountry: { type: String, default: "" },
  userProfileImage: { type: String, default: "" },
  mediaUrl: { type: String, required: true },
  thumbnailUrl: { type: String, default: null },
  mediaType: { type: String, enum: ["image", "video"], required: true },
  durationSeconds: { type: Number, default: null },
  likedBy: [{ type: String }],
  likedByMeta: [
    {
      userId: { type: String },
      likedAt: { type: Date },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Moment", MomentSchema);
