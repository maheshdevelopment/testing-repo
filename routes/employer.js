import express from "express";
import pool from "../config/database.js";
import { authenticateToken, checkRole } from "../middleware/auth.js";

const router = express.Router();

// Create or update employer profile
router.post(
  "/profile",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        company_name,
        company_description,
        industry,
        company_size,
        website_url,
        gst_number,
        pan_number,
        address,
        city,
        state,
        pincode,
        contact_person,
        contact_designation,
      } = req.body;

      const profileResult = await client.query(
        `
      INSERT INTO employer_profiles (
        user_id, company_name, company_description, industry, company_size,
        website_url, gst_number, pan_number, address, city, state, pincode,
        contact_person, contact_designation, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        company_name = EXCLUDED.company_name,
        company_description = EXCLUDED.company_description,
        industry = EXCLUDED.industry,
        company_size = EXCLUDED.company_size,
        website_url = EXCLUDED.website_url,
        gst_number = EXCLUDED.gst_number,
        pan_number = EXCLUDED.pan_number,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        pincode = EXCLUDED.pincode,
        contact_person = EXCLUDED.contact_person,
        contact_designation = EXCLUDED.contact_designation,
        updated_at = NOW()
      RETURNING *;
      `,
        [
          req.user.userId,
          company_name,
          company_description,
          industry,
          company_size,
          website_url,
          gst_number,
          pan_number,
          address,
          city,
          state,
          pincode,
          contact_person,
          contact_designation,
        ]
      );

      res.json({ success: true, profile: profileResult.rows[0] });
    } catch (error) {
      console.error("Create employer profile error:", error);
      res.status(500).json({
        error: "Failed to create employer profile",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

// Get employer profile
router.get(
  "/profile",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    try {
      const profileResult = await pool.query(
        "SELECT * FROM employer_profiles WHERE user_id=$1 LIMIT 1",
        [req.user.userId]
      );

      if (!profileResult.rows.length) {
        return res.status(404).json({ error: "Employer profile not found" });
      }

      res.json({ success: true, profile: profileResult.rows[0] });
    } catch (error) {
      console.error("Get employer profile error:", error);
      res.status(500).json({
        error: "Failed to fetch employer profile",
        details: error.message,
      });
    }
  }
);

// Get applications for all jobs posted by the employer
router.get(
  "/applications",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      // Start transaction for safety
      await client.query("BEGIN");

      // Get employer profile
      const empResult = await client.query(
        "SELECT id FROM employer_profiles WHERE user_id=$1 LIMIT 1",
        [req.user.userId]
      );
      if (!empResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Employer profile not found" });
      }
      const employerId = empResult.rows[0].id;

      // Get all job IDs posted by this employer
      const jobsResult = await client.query(
        "SELECT id FROM jobs WHERE employer_id=$1",
        [employerId]
      );
      const jobIds = jobsResult.rows.map((j) => j.id);
      if (!jobIds.length) {
        await client.query("ROLLBACK");
        return res.json({ success: true, applications: [] });
      }

      // Fetch applications with candidate and job details
      const applicationsResult = await client.query(
        `
      SELECT a.*,
             jsonb_build_object('title', j.title, 'location', j.location) AS job,
             jsonb_build_object(
               'full_name', c.full_name,
               'current_location', c.current_location,
               'photo_url', c.photo_url,
               'resume_url', c.resume_url
             ) AS candidate
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN candidate_profiles c ON c.id = a.candidate_id
      WHERE a.job_id = ANY($1)
      ORDER BY a.applied_at DESC
      `,
        [jobIds]
      );

      await client.query("COMMIT");

      res.json({ success: true, applications: applicationsResult.rows });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Get applications error:", error);
      res.status(500).json({
        error: "Failed to fetch applications",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

// Update application status
router.patch(
  "/applications/:id/status",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        status,
        employer_notes,
        interview_scheduled_at,
        rejection_reason,
      } = req.body;

      const updateData = [];
      const values = [];
      let idx = 1;

      // Build dynamic query
      if (status) {
        updateData.push(`status=$${idx++}`);
        values.push(status);
      }
      if (employer_notes !== undefined) {
        updateData.push(`employer_notes=$${idx++}`);
        values.push(employer_notes);
      }
      if (rejection_reason !== undefined) {
        updateData.push(`rejection_reason=$${idx++}`);
        values.push(rejection_reason);
      }

      // Special handling for dates
      if (status === "shortlisted") {
        updateData.push(`shortlisted_at=NOW()`);
      }
      if (status === "interview_scheduled" && interview_scheduled_at) {
        updateData.push(`interview_scheduled_at=$${idx++}`);
        values.push(interview_scheduled_at);
      }

      updateData.push(`updated_at=NOW()`);

      const query = `UPDATE applications SET ${updateData.join(
        ", "
      )} WHERE id=$${idx} RETURNING *`;
      values.push(id);

      const result = await client.query(query, values);

      if (!result.rows.length) {
        return res.status(404).json({ error: "Application not found" });
      }

      res.json({ success: true, application: result.rows[0] });
    } catch (error) {
      console.error("Update application status error:", error);
      res.status(500).json({
        error: "Failed to update application status",
        details: error.message,
      });
    } finally {
      client.release();
    }
  }
);

export default router;
