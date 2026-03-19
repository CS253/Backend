const express = require('express');
const path = require("path");
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const authRoutes = require("./routes/authRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const photoRoutes = require("./routes/photoRoutes");
const documentRoutes = require("./routes/documentRoutes");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/auth", authRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/documents", documentRoutes);

// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'Travelly API is running...' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
