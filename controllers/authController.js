const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const BlacklistToken = require("../models/BlacklistToken");

// 🔐 LOGIN CONTROLLER
exports.login = async (req, res) => {
  const { email, password, role } = req.body;

  try {
    // 1. Find user with matching email and role
    const user = await User.findOne({ email, role });
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    // 3. Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 4. Return success response
    res.status(200).json({
      success: true,
      token,
      userId: user._id,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 📝 REGISTER CONTROLLER
exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    // 1. Check if user exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    // 2. Hash password
    const hashed = await bcrypt.hash(password, 10);

    // 3. Create new user
    const newUser = await User.create({ name, email, password: hashed, role });

    // 4. Generate JWT token
    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 5. Return success response
    res.status(201).json({
      success: true,
      token,
      userId: newUser._id,
      name: newUser.name,
      role: newUser.role,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// 🚪 LOGOUT CONTROLLER
exports.logout = async (req, res) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.split(" ")[1];

    // Add token to blacklist
    await BlacklistToken.create({ token });

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

