const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { initFirebase } = require('./services/firebaseAdmin');

// Initialize Firebase Admin
initFirebase();

const expenseRoutes = require('./routes/expenseRoutes');
const userRoutes = require('./routes/userRoutes');
const settlementRoutes = require('./routes/settlementRoutes');
const tripRoutes = require('./routes/tripRoutes');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/api', expenseRoutes);
app.use('/api', userRoutes);
app.use('/api', settlementRoutes);
app.use('/api', tripRoutes);

// Basic Route
app.get('/', (req, res) => {
  res.json({ message: 'Travelly API is running...' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
