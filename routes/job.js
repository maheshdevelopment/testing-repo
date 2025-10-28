import express from "express";
import pool from "../config/database.js";
import { authenticateToken, checkRole } from "../middleware/auth.js";

const router = express.Router();

// Create a new job
router.post(
  "/",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        title,
        description,
        requirements,
        job_type,
        experience_level,
        salary_min,
        salary_max,
        location,
        state,
        city,
        pincode,
        shift_timing,
        benefits,
        contact_details,
        expires_at,
        skills,
      } = req.body;

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

      // Insert job
      const jobResult = await client.query(
        `
      INSERT INTO jobs (
        employer_id, title, description, requirements, job_type, experience_level,
        salary_min, salary_max, location, state, city, pincode,
        shift_timing, benefits, contact_details, expires_at, status, posted_at, created_at, updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',NOW(),NOW(),NOW()
      )
      RETURNING *;
      `,
        [
          employerId,
          title,
          description,
          requirements,
          job_type,
          experience_level,
          salary_min,
          salary_max,
          location,
          state,
          city,
          pincode,
          shift_timing,
          benefits,
          contact_details,
          expires_at,
        ]
      );

      const jobId = jobResult.rows[0].id;

      // Insert job skills
      if (skills && skills.length) {
        for (const skill of skills) {
          const skillRes = await client.query(
            "SELECT id FROM skills WHERE name=$1 LIMIT 1",
            [skill.name]
          );
          if (skillRes.rows.length) {
            await client.query(
              `
            INSERT INTO job_skills (job_id, skill_id, is_required, proficiency_level, created_at)
            VALUES ($1,$2,$3,$4,NOW())
            `,
              [
                jobId,
                skillRes.rows[0].id,
                skill.is_required ?? true,
                skill.proficiency_level ?? "basic",
              ]
            );
          }
        }
      }

      await client.query("COMMIT");

      res.status(201).json({ success: true, job: jobResult.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create job error:", error);
      res
        .status(500)
        .json({ error: "Failed to create job", details: error.message });
    } finally {
      client.release();
    }
  }
);

// Get list of jobs with filters
router.get("/", authenticateToken, async (req, res) => {
  const {
    city,
    state,
    job_type,
    experience_level,
    search,
    limit = 20,
    offset = 0,
  } = req.query;
  const client = await pool.connect();
  try {
    const conditions = ["status=$1"];
    const values = ["active"];
    let idx = 2;

    if (city) {
      conditions.push(`city=$${idx++}`);
      values.push(city);
    }
    if (state) {
      conditions.push(`state=$${idx++}`);
      values.push(state);
    }
    if (job_type) {
      conditions.push(`job_type=$${idx++}`);
      values.push(job_type);
    }
    if (experience_level) {
      conditions.push(`experience_level=$${idx++}`);
      values.push(experience_level);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    let query = `
      SELECT j.*, 
             jsonb_build_object('company_name', e.company_name, 'logo_url', e.logo_url, 'city', e.city, 'state', e.state) AS employer
      FROM jobs j
      JOIN employer_profiles e ON e.id=j.employer_id
      ${whereClause}
      ORDER BY posted_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);

    const jobsRes = await client.query(query, values);

    res.json({ success: true, jobs: jobsRes.rows, count: jobsRes.rows.length });
  } catch (error) {
    console.error("Get jobs error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch jobs", details: error.message });
  } finally {
    client.release();
  }
});

// Get single job by ID
router.get("/:id", authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const jobRes = await client.query(
      `
      SELECT j.*, 
             jsonb_build_object('company_name', e.company_name, 'company_description', e.company_description,
                                 'logo_url', e.logo_url, 'city', e.city, 'state', e.state, 'industry', e.industry) AS employer,
             (SELECT jsonb_agg(jsonb_build_object('name', s.name, 'category', s.category, 'is_required', js.is_required, 'proficiency_level', js.proficiency_level))
              FROM job_skills js JOIN skills s ON s.id=js.skill_id
              WHERE js.job_id=j.id) AS skills
      FROM jobs j
      JOIN employer_profiles e ON e.id=j.employer_id
      WHERE j.id=$1
      `,
      [id]
    );

    if (!jobRes.rows.length)
      return res.status(404).json({ error: "Job not found" });

    res.json({ success: true, job: jobRes.rows[0] });
  } catch (error) {
    console.error("Get job error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch job", details: error.message });
  } finally {
    client.release();
  }
});

// Update job
router.patch(
  "/:id",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const updates = { ...req.body, updated_at: new Date() };

      const setQuery = [];
      const values = [];
      let idx = 1;
      for (const [key, value] of Object.entries(updates)) {
        setQuery.push(`${key}=$${idx++}`);
        values.push(value);
      }
      values.push(id);

      const updateRes = await client.query(
        `UPDATE jobs SET ${setQuery.join(", ")} WHERE id=$${idx} RETURNING *`,
        values
      );

      if (!updateRes.rows.length)
        return res.status(404).json({ error: "Job not found" });

      res.json({ success: true, job: updateRes.rows[0] });
    } catch (error) {
      console.error("Update job error:", error);
      res
        .status(500)
        .json({ error: "Failed to update job", details: error.message });
    } finally {
      client.release();
    }
  }
);

// Delete job
router.delete(
  "/:id",
  authenticateToken,
  checkRole(["employer"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;

      const deleteRes = await client.query(
        "DELETE FROM jobs WHERE id=$1 RETURNING *",
        [id]
      );

      if (!deleteRes.rows.length)
        return res.status(404).json({ error: "Job not found" });

      res.json({ success: true, message: "Job deleted successfully" });
    } catch (error) {
      console.error("Delete job error:", error);
      res
        .status(500)
        .json({ error: "Failed to delete job", details: error.message });
    } finally {
      client.release();
    }
  }
);

export default router;
