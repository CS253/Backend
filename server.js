const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/payments", paymentRoutes);

// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'Travelly API is running...' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
