const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const { initFirebase } = require("./services/firebaseAdmin");
const groupRoutes = require("./routes/groupRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const photoRoutes = require("./routes/photoRoutes");
const documentRoutes = require("./routes/documentRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const userRoutes = require("./routes/userRoutes");
const settlementRoutes = require("./routes/settlementRoutes");
const routePlannerRoutes = require("./routes/routePlannerRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

initFirebase();

const app = express();

app.use(helmet());

// vuln-16 fix: restrict CORS to explicit origins from env
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(morgan("dev"));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
const uploadTarget = process.env.LOCAL_UPLOAD_ROOT || path.join(__dirname, "uploads");
const fs = require('fs/promises');
const pathModule = require('path');
const { decryptBuffer } = require('./utils/encryption');

app.use("/uploads", async (req, res, next) => {
  try {
    // Prevent directory traversal
    if (req.path.includes('..')) return res.status(403).send('Forbidden');
    
    // Clean path and ensure it's safely joined
    let reqPath = decodeURIComponent(req.path);
    if (reqPath.startsWith('/')) reqPath = reqPath.slice(1);
    const absolutePath = pathModule.normalize(pathModule.join(uploadTarget, reqPath));
    
    // Confirm the path is still within uploadTarget (prevent tricks)
    if (!absolutePath.startsWith(pathModule.normalize(uploadTarget))) {
      return res.status(403).send('Forbidden');
    }

    try {
      const buffer = await fs.readFile(absolutePath);
      // Determine content type based on extension
      const ext = pathModule.extname(absolutePath).toLowerCase();
      const mimeTypes = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.pdf': 'application/pdf', '.webp': 'image/webp'
      };
      if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext]);
      
      // Decrypt and send (with fallback for legacy unencrypted files)
      let finalBuffer = buffer;
      try {
        finalBuffer = decryptBuffer(buffer);
      } catch (decryptErr) {
        // If it throws, it means it's likely a legacy unencrypted file
        console.warn(`Decryption failed for ${absolutePath}, serving raw buffer.`, decryptErr.message);
      }
      res.send(finalBuffer);
    } catch (e) {
      if (e.code === 'ENOENT') {
        return res.status(404).send('Not Found');
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

app.use("/api/groups", groupRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api", userRoutes);
app.use("/api", expenseRoutes);
app.use("/api", settlementRoutes);
app.use("/api/route-planner", routePlannerRoutes);
app.use("/api", notificationRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Travelly API is running..." });
});

app.use((err, req, res, next) => {
  console.error("Global Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal Server Error"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
