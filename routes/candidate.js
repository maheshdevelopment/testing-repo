import express from "express";
import pool from "../config/database.js";
import { authenticateToken, checkRole } from "../middleware/auth.js";
import axios from "axios";

const router = express.Router();

// Helper to bulk insert skills
const bulkInsertSkills = async (client, userId, skills) => {
  if (!skills || skills.length === 0) return;

  // Fetch skill IDs in one query
  const skillNames = skills.map((s) => s.name);
  const { rows: skillRows } = await client.query(
    "SELECT id, name FROM skills WHERE name = ANY($1)",
    [skillNames]
  );

  if (!skillRows.length) return;

  const insertValues = [];
  const values = [];
  let idx = 1;

  for (const skill of skills) {
    const skillObj = skillRows.find((s) => s.name === skill.name);
    if (!skillObj) continue;

    insertValues.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, NOW())`
    );
    values.push(
      userId,
      skillObj.id,
      skill.proficiency_level || "basic",
      skill.years_of_experience || 0
    );
    idx += 4;
  }

  if (insertValues.length > 0) {
    await client.query(
      `INSERT INTO user_skills (user_id, skill_id, proficiency_level, years_of_experience, created_at)
       VALUES ${insertValues.join(", ")}`,
      values
    );
  }
};

// Helper to bulk insert languages
const bulkInsertLanguages = async (client, userId, languages) => {
  if (!languages || languages.length === 0) return;

  const langCodes = languages.map((l) => l.code);
  const { rows: langRows } = await client.query(
    "SELECT id, code FROM languages WHERE code = ANY($1)",
    [langCodes]
  );

  if (!langRows.length) return;

  const insertValues = [];
  const values = [];
  let idx = 1;

  for (const lang of languages) {
    const langObj = langRows.find((l) => l.code === lang.code);
    if (!langObj) continue;

    insertValues.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, NOW())`
    );
    values.push(
      userId,
      langObj.id,
      lang.proficiency_level || "basic",
      lang.is_native || false
    );
    idx += 4;
  }

  if (insertValues.length > 0) {
    await client.query(
      `INSERT INTO user_languages (user_id, language_id, proficiency_level, is_native, created_at)
       VALUES ${insertValues.join(", ")}`,
      values
    );
  }
};

// Create or update candidate profile
router.post(
  "/profile",
  authenticateToken,
  checkRole(["candidate"]),
  async (req, res) => {
    const client = await pool.connect();
    try {
      const {
        full_name,
        age,
        gender,
        education,
        work_experience,
        current_location,
        location_preference,
        expected_salary_min,
        expected_salary_max,
        availability,
        bio,
        skills,
        languages,
      } = req.body;

      await client.query("BEGIN");

      // Upsert candidate profile
      const profileResult = await client.query(
        `
      INSERT INTO candidate_profiles (
        user_id, full_name, age, gender, education, work_experience,
        current_location, location_preference, expected_salary_min,
        expected_salary_max, availability, bio, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        age = EXCLUDED.age,
        gender = EXCLUDED.gender,
        education = EXCLUDED.education,
        work_experience = EXCLUDED.work_experience,
        current_location = EXCLUDED.current_location,
        location_preference = EXCLUDED.location_preference,
        expected_salary_min = EXCLUDED.expected_salary_min,
        expected_salary_max = EXCLUDED.expected_salary_max,
        availability = EXCLUDED.availability,
        bio = EXCLUDED.bio,
        updated_at = NOW()
      RETURNING *;
      `,
        [
          req.user.userId,
          full_name,
          age,
          gender,
          education,
          work_experience,
          current_location,
          location_preference,
          expected_salary_min,
          expected_salary_max,
          availability,
          bio,
        ]
      );

      // Delete old skills & languages and bulk insert new
      await client.query("DELETE FROM user_skills WHERE user_id=$1", [
        req.user.userId,
      ]);
      await bulkInsertSkills(client, req.user.userId, skills);

      await client.query("DELETE FROM user_languages WHERE user_id=$1", [
        req.user.userId,
      ]);
      await bulkInsertLanguages(client, req.user.userId, languages);

      await client.query("COMMIT");
      res.json({ success: true, profile: profileResult.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Create profile error:", error);
      res
        .status(500)
        .json({ error: "Failed to create profile", details: error.message });
    } finally {
      client.release();
    }
  }
);

// Get candidate profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const profileResult = await pool.query(
      `
      SELECT 
        cp.*,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'skill_id', us.skill_id,
            'proficiency_level', us.proficiency_level,
            'years_of_experience', us.years_of_experience,
            'name', s.name,
            'category', s.category
          )) FILTER (WHERE us.id IS NOT NULL), '[]'
        ) AS skills,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'language_id', ul.language_id,
            'proficiency_level', ul.proficiency_level,
            'is_native', ul.is_native,
            'code', l.code,
            'name', l.name
          )) FILTER (WHERE ul.id IS NOT NULL), '[]'
        ) AS languages
      FROM candidate_profiles cp
      LEFT JOIN user_skills us ON us.user_id = cp.user_id
      LEFT JOIN skills s ON s.id = us.skill_id
      LEFT JOIN user_languages ul ON ul.user_id = cp.user_id
      LEFT JOIN languages l ON l.id = ul.language_id
      WHERE cp.user_id = $1
      GROUP BY cp.id;
      `,
      [req.user.userId]
    );

    if (!profileResult.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json({ success: true, profile: profileResult.rows[0] });
  } catch (error) {
    console.error("Get profile error:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch profile", details: error.message });
  }
});

// Generate resume
router.post(
  "/generate-resume",
  authenticateToken,
  checkRole(["candidate"]),
  async (req, res) => {
    try {
      const { profileData } = req.body;
      const pythonServiceUrl =
        process.env.PYTHON_SERVICE_URL || "http://localhost:8000";

      const response = await axios.post(`${pythonServiceUrl}/generate-resume`, {
        profile: profileData,
      });

      const profileUpdateResult = await pool.query(
        `UPDATE candidate_profiles SET resume_url=$1, updated_at=NOW() WHERE user_id=$2 RETURNING *;`,
        [response.data.resume_url, req.user.userId]
      );

      res.json({
        success: true,
        resume_url: response.data.resume_url,
        profile: profileUpdateResult.rows[0],
      });
    } catch (error) {
      console.error("Generate resume error:", error);
      res
        .status(500)
        .json({ error: "Failed to generate resume", details: error.message });
    }
  }
);

// Get matched jobs
router.get(
  "/matched-jobs",
  authenticateToken,
  checkRole(["candidate"]),
  async (req, res) => {
    try {
      const candidateResult = await pool.query(
        "SELECT id FROM candidate_profiles WHERE user_id=$1",
        [req.user.userId]
      );

      if (!candidateResult.rows.length) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const candidateId = candidateResult.rows[0].id;

      const matchesResult = await pool.query(
        `
      SELECT jm.*, j.*, jsonb_build_object('company_name', ep.company_name, 'logo_url', ep.logo_url) AS employer
      FROM job_matches jm
      JOIN jobs j ON j.id = jm.job_id
      JOIN employer_profiles ep ON ep.id = j.employer_id
      WHERE jm.candidate_id = $1
      ORDER BY jm.match_score DESC
      LIMIT 20;
      `,
        [candidateId]
      );

      res.json({ success: true, matches: matchesResult.rows });
    } catch (error) {
      console.error("Get matched jobs error:", error);
      res.status(500).json({
        error: "Failed to fetch matched jobs",
        details: error.message,
      });
    }
  }
);

export default router;
