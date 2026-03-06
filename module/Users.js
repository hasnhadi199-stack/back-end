const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, length: 8 },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profileImage: { type: String, default: "" },
  age: { type: Number, default: null },
  dateOfBirth: { type: String, default: "" },  // تاريخ الميلاد (YYYY-MM-DD)
  height: { type: Number, default: null },    // الطول (سم)
  weight: { type: Number, default: null },     // الوزن (كغ)
  country: { type: String, default: "" },      // رمز الدولة (مثل SA, EG)
  gender: { type: String, default: "" },      // الجنس: "male" أو "female"
  month: { type: String, default: "" },
  hobby: { type: String, default: "" },
  status: { type: String, default: "" },
  loginPin: { type: String, default: null },
  loginPinExpiresAt: { type: Date, default: null },
  followers: [{
    userId: String,
    name: String,
    profileImage: String,
    age: Number,
    country: String,
    gender: String,
  }],
  friends: [{
    userId: String,
    name: String,
    profileImage: String,
    age: Number,
    country: String,
    gender: String,
  }],
  blocked: [{
    userId: String,
    name: String,
    profileImage: String,
    age: Number,
    country: String,
    gender: String,
  }],
});

module.exports = mongoose.model("User", UserSchema);

 