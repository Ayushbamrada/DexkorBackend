// server.js or app.js

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// Connect DB
connectDB();

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api", require("./routes/courseRoutes")); // ✅ for course APIs
// app.use('/api/progress', require('./routes/progressRoutes'));
const progressRoutes = require('./routes/progressRoutes');
app.use('/api/progress', progressRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
