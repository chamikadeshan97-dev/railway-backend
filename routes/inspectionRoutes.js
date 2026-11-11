import { Types } from "mongoose";
import { Router } from "express";

import Inspection from "../models/inspections.js";
import protectRoute from "../authMiddleware.js";

const router = Router();

/* ============================================================
   GET ALL INSPECTIONS
============================================================ */

router.get("/", async (req, res) => {
  try {
    const inspections = await Inspection.find().sort({
      updatedAt: -1,
    });

    res.status(200).json(inspections);
  } catch (err) {
    console.error("Error fetching inspections:", err);

    res.status(500).json({
      error: "Failed to fetch Inspections",
    });
  }
});

/* ============================================================
   CREATE INSPECTION
============================================================ */

router.post("/", async (req, res) => {
  try {
    const newInspection = new Inspection(req.body);

    await newInspection.save();

    res.status(201).json(newInspection);
  } catch (err) {
    console.error("Error creating inspection:", err);

    res.status(500).json({
      error: "Failed to create new Inspection",
    });
  }
});

/* ============================================================
   TEST / SEARCH INSPECTIONS BY ENGINE
============================================================ */

router.get("/s", async (req, res) => {
  const { engine } = req.query;

  try {
    const inspections = await Inspection.find({
      engine,
    }).sort({
      updatedAt: -1,
    });

    if (inspections.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(inspections);
  } catch (err) {
    console.error("Error fetching inspections:", err);

    res.status(500).json({
      error: "Failed to fetch Inspections",
    });
  }
});

/* ============================================================
   GET INSPECTIONS BY LF COM NUMBER
============================================================ */

router.get("/inspectionsByLFCComnumber", async (req, res) => {
  const { lfComNum } = req.query;

  try {
    const inspections = await Inspection.find({
      lfComNum,
    }).sort({
      updatedAt: -1,
    });

    res.status(200).json(inspections);
  } catch (err) {
    console.error(
      "Error fetching inspections by LF com number:",
      err
    );

    res.status(500).json({
      error: "Failed to fetch Inspections",
    });
  }
});

/* ============================================================
   GET INSPECTION BY ID
============================================================ */

router.get("/inspectionById", async (req, res) => {
  const { Id } = req.query;

  if (!Id || !Types.ObjectId.isValid(Id)) {
    return res.status(400).json({
      error: "Invalid ID format",
    });
  }

  try {
    const inspection = await Inspection.findById(Id);

    if (!inspection) {
      return res.status(404).json({
        error: "Inspection not found",
      });
    }

    res.status(200).json(inspection);
  } catch (err) {
    console.error("Error fetching inspection by ID:", err);

    res.status(500).json({
      error: "Failed to fetch Inspection",
    });
  }
});

/* ============================================================
   GET LATEST INSPECTION BY ENGINE WITHIN 24 HOURS
============================================================ */

router.get("/inspectionsByEnginenumber", async (req, res) => {
  const { engine } = req.query;

  if (!engine) {
    return res.status(400).json({
      error: "Engine number is required",
    });
  }

  const currentTime = new Date();

  const past24Hours = new Date(
    currentTime.getTime() - 24 * 60 * 60 * 1000
  );

  try {
    const inspection = await Inspection.findOne({
      engine,
      updatedAt: {
        $gte: past24Hours,
        $lte: currentTime,
      },
    }).sort({
      updatedAt: -1,
    });

    if (!inspection) {
      return res.status(200).json([]);
    }

    res.status(200).json(inspection);
  } catch (err) {
    console.error(
      "Error retrieving inspection data:",
      err
    );

    res.status(500).json({
      error: "Error retrieving inspection data",
    });
  }
});

export default router;