import express from "express";
import pool from "../config/database.js";
import { authenticateToken, checkRole } from "../middleware/auth.js";

const router = express.Router();

// -------------------------------------------------------------
// 🧩 APPLY TO A JOB
// -------------------------------------------------------------
router.post(
  "/",
  authenticateToken,
  checkRole(["candidate"]),
  async (req, res) => {
    const { job_id } = req.body;
    const userId = req.user.userId;
    const step = "APPLY_JOB";

    if (!job_id) {
      return res.status(400).json({ error: "Job ID is required" });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get candidate profile
      const candidateRes = await client.query(
        "SELECT id FROM candidate_profiles WHERE user_id = $1",
        [userId]
      );

      if (candidateRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Candidate profile not found" });
      }

      const candidateId = candidateRes.rows[0].id;

      // Check existing application
      const existingApp = await client.query(
        "SELECT id FROM applications WHERE job_id = $1 AND candidate_id = $2",
        [job_id, candidateId]
      );

      if (existingApp.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Already applied to this job" });
      }

      // Insert new application
      const insertQuery = `
      INSERT INTO applications (job_id, candidate_id, status, applied_at)
      VALUES ($1, $2, 'applied', NOW())
      RETURNING *;
    `;
      const { rows } = await client.query(insertQuery, [job_id, candidateId]);

      await client.query("COMMIT");

      console.log(`[${step}] Candidate ${userId} applied to Job ${job_id}`);
      res.status(201).json({
        success: true,
        application: rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`[${step}] Error:`, error.message);
      res.status(500).json({ error: "Failed to apply to job" });
    } finally {
      client.release();
    }
  }
);

// -------------------------------------------------------------
// 🧾 GET MY APPLICATIONS (with job + employer info)
// -------------------------------------------------------------
router.get(
  "/my-applications",
  authenticateToken,
  checkRole(["candidate"]),
  async (req, res) => {
    const userId = req.user.userId;
    const step = "GET_MY_APPLICATIONS";

    const client = await pool.connect();

    try {
      // Fetch candidate profile ID
      const candidateRes = await client.query(
        "SELECT id FROM candidate_profiles WHERE user_id = $1",
        [userId]
      );

      if (candidateRes.rows.length === 0) {
        return res.status(404).json({ error: "Candidate profile not found" });
      }

      const candidateId = candidateRes.rows[0].id;

      // Fetch applications with job and employer info
      const query = `
        SELECT 
          a.*,
          j.title AS job_title,
          j.description AS job_description,
          j.city AS job_city,
          j.state AS job_state,
          j.created_at AS job_posted_date,
          e.company_name,
          e.logo_url,
          e.city AS employer_city,
          e.state AS employer_state
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN employer_profiles e ON j.employer_id = e.id
        WHERE a.candidate_id = $1
        ORDER BY a.applied_at DESC;
      `;

      const { rows: applications } = await client.query(query, [candidateId]);

      console.log(
        `[${step}] Found ${applications.length} applications for user ${userId}`
      );
      res.json({
        success: true,
        applications,
      });
    } catch (error) {
      console.error(`[${step}] Error:`, error.message);
      res.status(500).json({ error: "Failed to fetch applications" });
    } finally {
      client.release();
    }
  }
);

export default router;
