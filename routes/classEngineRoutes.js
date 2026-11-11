import { Router } from "express";

import ClassEngine from "../models/classEngines.js";
import protectRoute from "../authMiddleware.js";

const router = Router();

/* ============================================================
   GET ALL CLASS ENGINES
============================================================ */

router.get("/", async (req, res) => {
  try {
    const classEngines = await ClassEngine.find().sort({
      year: 1,
    });

    res.status(200).json(classEngines);
  } catch (err) {
    console.error("Error fetching class engines:", err);

    res.status(500).json({
      error: "Failed to fetch Class Engines",
    });
  }
});

/* ============================================================
   GET CLASS ENGINES BY TYPE
============================================================ */

router.get("/classEnginesbyTypeName", async (req, res) => {
  const { type, sortOrder } = req.query;

  try {
    const query = {};

    if (type) {
      query.type = {
        $regex: `^${type}`,
        $options: "i",
      };
    }

    const classEngines = await ClassEngine.find(query).sort({
      year: sortOrder === "desc" ? -1 : 1,
    });

    res.status(200).json(classEngines);
  } catch (err) {
    console.error(
      "Error fetching class engines by type:",
      err
    );

    res.status(500).json({
      error: "Failed to fetch Class Engines",
    });
  }
});

export default router;