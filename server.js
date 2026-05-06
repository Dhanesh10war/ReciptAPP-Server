import express from "express";
import cors from "cors";
import pino from "pino";
import routes from "./routes.js";

const logger = pino({ level: "info" });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url });
  next();
});

app.use("/", routes);

app.use((err, req, res, next) => {
  logger.error(err);
  res.status(500).json({ ok: false, error: err.message });
});

process.on("uncaughtException", (err) => {
  console.error("CRITICAL ERROR (Uncaught):", err.message);
  // Do NOT exit, keep the server alive
});

process.on("unhandledRejection", (reason) => {
  console.error("CRITICAL ERROR (Promise Rejection):", reason);
  // Do NOT exit
});

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT}`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n!!! PORT ${PORT} IS ALREADY IN USE !!!`);
    console.error("The server is ALREADY RUNNING in another window. Please use that one.\n");
  } else {
    console.error("Server Error:", err);
  }
});
