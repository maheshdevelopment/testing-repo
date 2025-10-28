// server.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import pool from "./config/database.js"; // your pg pool
import { validateEnv } from "./config/validateEnv.js"; // env check helper
import authRoutes from "./routes/auth.js";
import candidateRoutes from "./routes/candidate.js";
import employerRoutes from "./routes/employer.js";
import jobRoutes from "./routes/job.js";
import skillRoutes from "./routes/skill.js";
import applicationRoutes from "./routes/application.js";
import { setupSocketHandlers } from "./socket/handlers.js";

dotenv.config();
validateEnv();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 8080;

// ------------------- SOCKET.IO -------------------
const io = new Server(httpServer, {
  cors: {
    origin: process.env.VITE_APP_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

setupSocketHandlers(io);

// ------------------- MIDDLEWARES -------------------
const isDev = process.env.NODE_ENV === "development";

// Logging
app.use(morgan(isDev ? "dev" : "combined"));

// Helmet for security (adjust in dev)
if (isDev) {
  app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
} else {
  app.use(helmet());
}

// Compression for faster responses
app.use(compression());

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// JSON and URL-encoded parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ------------------- RATE LIMITING -------------------

// General limit (100 requests / 15 mins)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use("/api/", generalLimiter);

// Stricter limit for OTP endpoints
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many OTP requests. Please try again later.",
});
app.use("/api/auth/send-otp", otpLimiter);

// ------------------- ROUTES -------------------
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/candidate", candidateRoutes);
app.use("/api/v1/employer", employerRoutes);
app.use("/api/v1/jobs", jobRoutes);
app.use("/api/v1/skills", skillRoutes);
app.use("/api/v1/applications", applicationRoutes);

// ------------------- HEALTH CHECK -------------------
app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "ok", serverTime: result.rows[0].now });
  } catch (err) {
    console.error("Database health check failed:", err.message);
    res
      .status(500)
      .json({ status: "error", message: "Database not reachable" });
  }
});
app.get("/", async (req, res) => {
  try {
    const time = new Date();
    res.json({
      status: "ok",
      message: `The server is running fine at ${time}`,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});
// ------------------- GLOBAL ERROR HANDLER -------------------
app.use((err, req, res, next) => {
  console.error("🔥 Global Error:", err.stack || err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// ------------------- SERVER START -------------------
const HOST = "0.0.0.0"; // listen on all network interfaces

httpServer.listen(PORT, HOST, async () => {
  try {
    await pool.connect();
    console.log(`✅ Connected to PostgreSQL`);
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
  }

  console.log("🌐 Environment:", process.env.NODE_ENV);
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
  console.log("⚡ Socket.IO enabled for real-time features");
});

// ------------------- GRACEFUL SHUTDOWN -------------------
process.on("SIGINT", async () => {
  console.log("🧹 Shutting down gracefully...");
  await pool.end();
  io.close(() => console.log("Socket server closed"));
  process.exit(0);
});
