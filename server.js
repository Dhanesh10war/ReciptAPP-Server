import express from "express";
import cors from "cors";
import pino from "pino";
import routes from "./routes.js";

const logger = pino({ level: "info" });

const app = express();

const PORT = process.env.PORT || 5001;

// =====================================================
// Middlewares
// =====================================================
app.use(cors());

app.use(express.json({ limit: "1mb" }));

// =====================================================
// Request Logger
// =====================================================
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
  });

  next();
});

// =====================================================
// Root Route
// =====================================================
app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "Receipt Backend API",
    status: "running",
    port: PORT,
  });
});

// =====================================================
// API Routes
// =====================================================
app.use("/", routes);

// =====================================================
// 404 Handler
// =====================================================
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
  });
});

// =====================================================
// Error Handler
// =====================================================
app.use((err, req, res, next) => {
  logger.error(err);

  res.status(500).json({
    ok: false,
    error: err.message,
  });
});

// =====================================================
// Prevent Crashes
// =====================================================
process.on("uncaughtException", (err) => {
  console.error("CRITICAL ERROR (Uncaught):", err.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("CRITICAL ERROR (Promise Rejection):", reason);
});

// =====================================================
// Start Server
// =====================================================
const server = app
  .listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on port ${PORT}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n!!! PORT ${PORT} IS ALREADY IN USE !!!`);
      console.error(
        "The server is ALREADY RUNNING in another window. Please use that one.\n"
      );
    } else {
      console.error("Server Error:", err);
    }
  });
