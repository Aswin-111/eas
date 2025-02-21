import mongoose from "mongoose"

const userMastSchema = new mongoose.Schema(
  {
    comp_code: { type: String, required: true },
    user_id: { type: String, required: true },
    user_name: { type: String, required: true },
    user_password: { type: String },
    user_type: { type: String },
  },
  {
    timestamps: true,
  }
);

userMastSchema.index({ comp_code: 1, user_id: 1 }, { unique: true });

const UserMast = mongoose.model("UserMast", userMastSchema);

export default UserMast;
