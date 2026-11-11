import { Router } from "express";

import protectRoute from "../authMiddleware.js";

import Engine from "../models/engine.js";
import ClassEngine from "../models/classEngines.js";

const router = Router();

/* ============================================================
   GET ALL ENGINES
============================================================ */

router.get("/", async (req, res) => {
  try {
    const engines = await Engine.find().sort({
      updatedAt: -1,
    });

    res.status(200).json(engines);
  } catch (err) {
    console.error("Error fetching engines:", err);

    res.status(500).json({
      error: "Failed to fetch engines",
    });
  }
});

/* ============================================================
   CREATE ENGINE
============================================================ */

router.post("/", async (req, res) => {
  try {
    const newEngine = new Engine(req.body);

    await newEngine.save();

    res.status(201).json(newEngine);
  } catch (err) {
    console.error("Error creating engine:", err);

    res.status(500).json({
      error: "Failed to create Engine",
    });
  }
});

/* ============================================================
   GET ENGINE CLASSES
============================================================ */

router.get("/classes", async (req, res) => {
  try {
    const eng = await ClassEngine.aggregate([
      {
        $addFields: {
          numericPart: {
            $toInt: {
              $substr: [
                "$type",
                1,
                {
                  $subtract: [
                    { $strLenBytes: "$type" },
                    1,
                  ],
                },
              ],
            },
          },
        },
      },

      {
        $sort: {
          numericPart: 1,
        },
      },

      {
        $project: {
          type: 1,
          numericPart: 0,
        },
      },
    ]);

    res.status(200).json(eng);
  } catch (err) {
    console.error("Error fetching class engines:", err);

    res.status(500).json({
      error: "Failed to fetch Class Engines",
    });
  }
});

/* ============================================================
   GET ENGINES BY CLASS
============================================================ */

router.get("/enginesByClass", async (req, res) => {
  const { className } = req.query;

  try {
    const engines = await Engine.find({
      class: {
        $regex: `^${className}`,
        $options: "i",
      },
    });

    res.status(200).json(engines);
  } catch (err) {
    console.error("Error fetching engines by class:", err);

    res.status(500).json({
      error: "Failed to fetch Engines",
    });
  }
});

/* ============================================================
   GET ENGINES BY CLASS TYPE
============================================================ */

router.get("/enginesByClassType", async (req, res) => {
  const { type } = req.query;

  try {
    const engines = await Engine.find({
      subClass: {
        $regex: `^${type}-`,
        $options: "i",
      },
    });

    res.status(200).json(engines);
  } catch (err) {
    console.error("Error fetching engines by type:", err);

    res.status(500).json({
      error: "Failed to fetch Type",
    });
  }
});

/* ============================================================
   GET ENGINE BY SUB CLASS
============================================================ */

router.get("/engineBySubClass", async (req, res) => {
  const { subClass } = req.query;

  try {
    const engine = await Engine.findOne({
      subClass,
    });

    if (!engine) {
      return res.status(404).json({
        error: "Engine not found",
      });
    }

    res.status(200).json(engine);
  } catch (err) {
    console.error("Error fetching engine:", err);

    res.status(500).json({
      error: "Failed to fetch Engine",
    });
  }
});

/* ============================================================
   DELETE ENGINE
============================================================ */

router.delete("/engineById", async (req, res) => {
  const { subClass } = req.query;

  try {
    const engine = await Engine.findOne({
      subClass,
    });

    if (!engine) {
      return res.status(404).json({
        error: "Engine not found",
      });
    }

    const deletedEngine =
      await Engine.findByIdAndDelete(engine._id);

    res.status(200).json({
      message: "Engine deleted successfully",
      engine: deletedEngine,
    });
  } catch (err) {
    console.error("Error deleting engine:", err);

    res.status(500).json({
      error: "Failed to delete engine",
    });
  }
});

export default router;