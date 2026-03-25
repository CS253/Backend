// server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const routePlannerRoutes = require("./routes/routePlannerRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Route Planner Backend is running"
  });
});

app.use("/api/route-planner", routePlannerRoutes);

app.use((err, req, res, next) => {
  console.error("Global Error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});