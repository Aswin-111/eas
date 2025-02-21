import UserMast from "../models/UserMast.js";

export const login = async (req, res) => {
  const { user_name, user_password } = req.body;
  console.log(user_name, user_password);
  try {
    const user = await UserMast.findOne({ user_name });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // const isMatch = await bcrypt.compare(user_password, user.user_password);

    const isMatch = user.user_password === user_password;

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      comp_code: user.comp_code,
      user_id: user.user_id,
      user_name: user.user_name,
      user_type: user.user_type,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
