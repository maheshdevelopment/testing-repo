import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/database.js";
import dotenv from "dotenv";

dotenv.config();
const router = express.Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// ---------------- Helper Functions ----------------
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Extract client metadata
const getClientInfo = (req) => {
  return {
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
    device: req.headers["user-agent"] || "unknown-device",
  };
};

// Centralized logging (to console + DB)
const logEvent = async ({
  mobile,
  userId = null,
  role = "unknown",
  step,
  status,
  message,
  errorStack = null,
  ip = null,
  device = null,
}) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] [${status.toUpperCase()}] [${role}] [${mobile || "N/A"}] (${
      ip || "no-ip"
    }) ${step} → ${message}`
  );

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO auth_logs (user_id, mobile, user_role, step, status, message, error_stack, ip_address, device_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, mobile, role, step, status, message, errorStack, ip, device]
    );
  } catch (err) {
    console.error("Failed to insert auth log:", err.message);
  } finally {
    client.release();
  }
};

const runQuery = async (query, params = [], meta = {}) => {
  const { mobile, role, step, ip, device } = meta;
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    await logEvent({
      mobile,
      role,
      step,
      status: "success",
      message: "Query executed",
      ip,
      device,
    });
    return result.rows;
  } catch (err) {
    await logEvent({
      mobile,
      role,
      step,
      status: "error",
      message: err.message,
      errorStack: err.stack,
      ip,
      device,
    });
    throw err;
  } finally {
    client.release();
  }
};

// ---------------- SEND OTP ----------------
router.post("/send-otp", async (req, res) => {
  console.log(req.body);
  const { mobile, role = "candidate" } = req.body;
  const { ip, device } = getClientInfo(req);
  const step = "SEND_OTP";

  try {
    if (!mobile || mobile.length < 10) {
      await logEvent({
        mobile,
        role,
        step,
        status: "warning",
        message: "Invalid mobile number",
        ip,
        device,
      });
      return res.status(400).json({ error: "Valid mobile number required" });
    }

    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const existing = await runQuery(
      "SELECT id FROM users WHERE mobile = $1",
      [mobile],
      { mobile, role, step: `${step}_CHECK_USER`, ip, device }
    );

    if (existing.length > 0) {
      await runQuery(
        "UPDATE users SET otp = $1, otp_expires_at = $2 WHERE mobile = $3",
        [otp, otpExpiresAt, mobile],
        { mobile, role, step: `${step}_UPDATE_OTP`, ip, device }
      );
      await logEvent({
        mobile,
        userId: existing[0].id,
        role,
        step,
        status: "success",
        message: "OTP updated for existing user",
        ip,
        device,
      });
    } else {
      const inserted = await runQuery(
        `INSERT INTO users (mobile, role, otp, otp_expires_at, is_active, is_verified)
         VALUES ($1, $2, $3, $4, true, false)
         RETURNING id`,
        [mobile, role, otp, otpExpiresAt],
        { mobile, role, step: `${step}_INSERT_USER`, ip, device }
      );
      await logEvent({
        mobile,
        userId: inserted[0].id,
        role,
        step,
        status: "success",
        message: "New user created and OTP assigned",
        ip,
        device,
      });
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`OTP for ${mobile}: ${otp}`);
    }

    res.json({
      success: true,
      message: "OTP sent successfully",
      otp: process.env.NODE_ENV === "development" ? otp : undefined,
    });
  } catch (error) {
    await logEvent({
      mobile,
      role,
      step,
      status: "error",
      message: "Failed to send OTP",
      errorStack: error.stack,
      ip,
      device,
    });
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

// ---------------- VERIFY OTP ----------------
router.post("/verify-otp", async (req, res) => {
  const { mobile, otp } = req.body;
  const { ip, device } = getClientInfo(req);
  const step = "VERIFY_OTP";

  try {
    if (!mobile || !otp) {
      await logEvent({
        mobile,
        step,
        status: "warning",
        message: "Missing mobile or OTP",
        ip,
        device,
      });
      return res.status(400).json({ error: "Mobile and OTP required" });
    }

    // Step 1: Validate OTP
    const users = await runQuery(
      "SELECT * FROM users WHERE mobile = $1 AND otp = $2",
      [mobile, otp],
      { mobile, step: `${step}_CHECK`, ip, device }
    );

    const user = users[0];
    if (!user) {
      await logEvent({
        mobile,
        step,
        status: "warning",
        message: "Invalid OTP",
        ip,
        device,
      });
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (new Date(user.otp_expires_at) < new Date()) {
      await logEvent({
        mobile,
        step,
        status: "warning",
        message: "OTP expired",
        ip,
        device,
      });
      return res.status(400).json({ error: "OTP expired" });
    }

    // Step 2: Mark user as verified
    await runQuery(
      "UPDATE users SET is_verified = true, otp = NULL, otp_expires_at = NULL WHERE id = $1",
      [user.id],
      { mobile, role: user.role, step: `${step}_UPDATE_VERIFIED`, ip, device }
    );

    // Step 3: Check if user has completed profile
    let hasProfile = false;

    if (user.role === "candidate") {
      const result = await runQuery(
        "SELECT id FROM candidate_profiles WHERE user_id = $1",
        [user.id],
        {
          mobile,
          role: user.role,
          step: `${step}_CHECK_CANDIDATE_PROFILE`,
          ip,
          device,
        }
      );
      hasProfile = result.length > 0;
    } else if (user.role === "employer") {
      const result = await runQuery(
        "SELECT id FROM employer_profiles WHERE user_id = $1",
        [user.id],
        {
          mobile,
          role: user.role,
          step: `${step}_CHECK_EMPLOYER_PROFILE`,
          ip,
          device,
        }
      );
      hasProfile = result.length > 0;
    }

    // Step 4: Define redirect URL
    let redirectTo;
    if (user.role === "candidate") {
      redirectTo = hasProfile
        ? "/candidate/dashboard"
        : "/candidate/profile-form";
    } else if (user.role === "employer") {
      redirectTo = hasProfile
        ? "/employer/dashboard"
        : "/employer/profile-form";
    } else if (user.role === "admin") {
      redirectTo = "/admin/dashboard";
    }

    // Step 5: Generate JWT token
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    // Step 6: Log success
    await logEvent({
      mobile,
      userId: user.id,
      role: user.role,
      step,
      status: "success",
      message: "OTP verified successfully",
      ip,
      device,
    });

    // Step 7: Send final response
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        mobile: user.mobile,
        role: user.role,
        isVerified: true,
      },
      profileCompleted: hasProfile,
      redirectTo,
    });
  } catch (error) {
    await logEvent({
      mobile,
      step,
      status: "error",
      message: "Failed to verify OTP",
      errorStack: error.stack,
      ip,
      device,
    });
    res.status(500).json({ error: "Failed to verify OTP" });
  }
});

// ---------------- REGISTER ----------------
router.post("/register", async (req, res) => {
  const { mobile, email, password, role = "candidate" } = req.body;
  const { ip, device } = getClientInfo(req);
  const step = "REGISTER";

  try {
    if (!mobile) {
      await logEvent({
        mobile,
        role,
        step,
        status: "warning",
        message: "Mobile number missing",
        ip,
        device,
      });
      return res.status(400).json({ error: "Mobile number required" });
    }

    const existing = await runQuery(
      "SELECT id FROM users WHERE mobile = $1",
      [mobile],
      { mobile, role, step: `${step}_CHECK_EXISTING`, ip, device }
    );
    if (existing.length > 0) {
      await logEvent({
        mobile,
        role,
        step,
        status: "warning",
        message: "User already exists",
        ip,
        device,
      });
      return res.status(400).json({ error: "User already exists" });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const newUser = await runQuery(
      `INSERT INTO users (mobile, email, password_hash, role, is_active, is_verified)
       VALUES ($1, $2, $3, $4, true, false)
       RETURNING id, mobile, email, role`,
      [mobile, email || null, passwordHash, role],
      { mobile, role, step: `${step}_INSERT_USER`, ip, device }
    );

    const user = newUser[0];
    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile, role: user.role },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    await logEvent({
      mobile,
      userId: user.id,
      role,
      step,
      status: "success",
      message: "Registration successful",
      ip,
      device,
    });

    res.status(201).json({ success: true, token, user });
  } catch (error) {
    await logEvent({
      mobile,
      role,
      step,
      status: "error",
      message: "Registration failed",
      errorStack: error.stack,
      ip,
      device,
    });
    res.status(500).json({ error: "Registration failed" });
  }
});

// ---------------- HEALTH CHECK ----------------
router.get("/health", async (req, res) => {
  const { ip, device } = getClientInfo(req);
  try {
    const result = await runQuery("SELECT NOW()", [], {
      mobile: "SYSTEM",
      role: "system",
      step: "HEALTH_CHECK",
      ip,
      device,
    });
    res.json({ status: "ok", serverTime: result[0].now });
  } catch (err) {
    await logEvent({
      mobile: "SYSTEM",
      step: "HEALTH_CHECK",
      status: "error",
      message: err.message,
      errorStack: err.stack,
      ip,
      device,
    });
    res
      .status(500)
      .json({ status: "error", message: "Database connection failed" });
  }
});

export default router;
