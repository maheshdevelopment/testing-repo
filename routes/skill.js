import express from "express";
import pool from "../config/database.js"; // your pg pool
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// -------------------- GET ALL SKILLS --------------------
router.get("/", authenticateToken, async (req, res) => {
  const { category, search } = req.query;
  const step = "GET_SKILLS";

  try {
    let baseQuery = `SELECT * FROM skills WHERE is_active = true`;
    const params = [];

    if (category) {
      params.push(category);
      baseQuery += ` AND category = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      baseQuery += ` AND name ILIKE $${params.length}`;
    }

    baseQuery += ` ORDER BY name ASC`;

    const { rows: skills } = await pool.query(baseQuery, params);

    console.log(`[${step}] Returned ${skills.length} skills`);
    res.json({
      success: true,
      skills,
    });
  } catch (error) {
    console.error(`[${step}] Error:`, error.message);
    res.status(500).json({ error: "Failed to fetch skills" });
  }
});

// -------------------- GET UNIQUE CATEGORIES --------------------
router.get("/categories", authenticateToken, async (req, res) => {
  const step = "GET_SKILL_CATEGORIES";

  try {
    const query = `
      SELECT DISTINCT category 
      FROM skills 
      WHERE is_active = true 
      AND category IS NOT NULL
      ORDER BY category ASC
    `;

    const { rows } = await pool.query(query);
    const categories = rows.map((r) => r.category);

    console.log(`[${step}] Returned ${categories.length} categories`);
    res.json({
      success: true,
      categories,
    });
  } catch (error) {
    console.error(`[${step}] Error:`, error.message);
    res.status(500).json({ error: "Failed to fetch skill categories" });
  }
});

export default router;
