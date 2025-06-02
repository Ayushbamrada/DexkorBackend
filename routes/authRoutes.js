const express = require("express");
const router = express.Router();
const { login, register, logout } = require("../controllers/authController");

router.get("/", (req, res) => {
    res.send("Welcome to the authentication API");
});

// 🔐 User login
router.post("/login", login);

// 📝 User registration (optional, useful for testing)
router.post("/register", register);

// 🚪 User logout
router.post("/logout", logout);

module.exports = router;
