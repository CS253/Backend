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

initFirebase();

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());
const uploadTarget = process.env.LOCAL_UPLOAD_ROOT || path.join(__dirname, "uploads");
app.use("/uploads", express.static(uploadTarget));

app.use("/api/groups", groupRoutes);
app.use("/api/media", mediaRoutes);
app.use("/api/photos", photoRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api", userRoutes);
app.use("/api", expenseRoutes);
app.use("/api", settlementRoutes);
app.use("/api/route-planner", routePlannerRoutes);

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
