
import { Router } from "express";

import EngineInspection from "../models/engineInspection.js";
import Engine from "../models/engine.js";

const router = Router();

/* ============================================================
   HELPERS
============================================================ */

const toResultsObject = (results) => {
  if (!results) return {};

  if (results instanceof Map) {
    return Object.fromEntries(results);
  }

  return results;
};

/* ============================================================
   GET LATEST ENGINE INSPECTION
============================================================ */

router.get("/latest/:subClass", async (req, res) => {
  try {
    const subClass = req.params.subClass?.trim();

    if (!subClass) {
      return res.status(400).json({
        message: "Engine subclass is required",
      });
    }

    const engine = await Engine.findOne({
      subClass,
    }).lean();

    if (!engine) {
      return res.status(404).json({
        message: "Engine not found",
      });
    }

    const latestInspection =
      await EngineInspection.findOne({
        engine: subClass,
      })
        .sort({
          inspectedAt: -1,
          _id: -1,
        })
        .lean();

    if (!latestInspection) {
      return res.status(200).json({
        engine: subClass,
        hasPreviousInspection: false,
        latestInspection: null,
        reportedFaults: [],
        faultCount: 0,
      });
    }

    const inspectionResults = toResultsObject(
      latestInspection.inspectionResults
    );

    const reportedFaults = Object.entries(
      inspectionResults
    )
      .filter(([, value]) => value === false)
      .map(([component]) => component);

    return res.status(200).json({
      engine: subClass,
      hasPreviousInspection: true,

      latestInspection: {
        _id: latestInspection._id,
        tripCardId: latestInspection.tripCardId,
        trainNumber: latestInspection.trainNumber,
        driverComNum: latestInspection.driverComNum,
        inspectedAt: latestInspection.inspectedAt,
        inspectionResults,
        specialNoticedIssues:
          latestInspection.specialNoticedIssues || "",
      },

      reportedFaults,
      faultCount: reportedFaults.length,
    });

  } catch (error) {
    console.error(
      "Error fetching latest engine inspection:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to retrieve latest engine inspection",
    });
  }
});

/* ============================================================
   DYNAMIC CONSECUTIVE LOCOMOTIVE FAULT SUMMARY
============================================================ */

router.get("/consecutive-summary", async (req, res) => {
  try {
    const inspections = await EngineInspection.find({})
      .select(
        "engine tripCardId inspectedAt inspectionResults"
      )
      .sort({
        engine: 1,
        inspectedAt: -1,
        _id: -1,
      })
      .lean();

    const engineMap = new Map();

    for (const inspection of inspections) {
      const engine = inspection.engine;

      if (!engine) continue;

      const results = toResultsObject(
        inspection.inspectionResults
      );

      if (!engineMap.has(engine)) {
        engineMap.set(engine, {
          engine,
          lastInspectedAt: inspection.inspectedAt,
          totalRecordedInspections: 0,
          components: new Map(),
        });
      }

      const engineData = engineMap.get(engine);

      engineData.totalRecordedInspections += 1;

      const inspectionNumber =
        engineData.totalRecordedInspections;

      /* ======================================================
         INCLUDE DYNAMIC INSPECTION FIELDS
      ====================================================== */

      for (const [field, value] of Object.entries(results)) {
        if (!engineData.components.has(field)) {
          engineData.components.set(field, {
            field,
            consecutiveCount: 0,
            currentCondition:
              inspectionNumber === 1 &&
              typeof value === "boolean"
                ? value
                : null,
            counting: inspectionNumber === 1,
          });
        }
      }

      /* ======================================================
         CALCULATE CONSECUTIVE FAULTS
      ====================================================== */

      for (const component of engineData.components.values()) {
        const value = results[component.field];

        if (inspectionNumber === 1) {
          component.currentCondition =
            typeof value === "boolean"
              ? value
              : null;
        }

        if (!component.counting) {
          continue;
        }

        if (value === false) {
          component.consecutiveCount += 1;
        } else {
          // A working or missing result ends the sequence.
          component.counting = false;
        }
      }
    }

    const summary = [];

    for (const engineData of engineMap.values()) {
      const components = Array.from(
        engineData.components.values()
      ).map(component => ({
        field: component.field,
        currentCondition: component.currentCondition,
        consecutiveCount: component.consecutiveCount,
      }));

      const activeFaults = components.filter(
        component => component.currentCondition === false
      );

      const repeatedFaults = activeFaults.filter(
        component => component.consecutiveCount >= 2
      );

      summary.push({
        engine: engineData.engine,
        lastInspectedAt: engineData.lastInspectedAt,
        totalRecordedInspections:
          engineData.totalRecordedInspections,
        activeFaultCount: activeFaults.length,
        repeatedFaultCount: repeatedFaults.length,
        highestConsecutiveCount: Math.max(
          0,
          ...activeFaults.map(
            component => component.consecutiveCount
          )
        ),
        components,
      });
    }

    summary.sort(
      (a, b) =>
        b.highestConsecutiveCount -
        a.highestConsecutiveCount
    );

    return res.status(200).json({
      totalEngines: summary.length,

      enginesWithActiveFaults: summary.filter(
        item => item.activeFaultCount > 0
      ).length,

      enginesWithRepeatedFaults: summary.filter(
        item => item.repeatedFaultCount > 0
      ).length,

      summary,
    });

  } catch (error) {
    console.error(
      "Error calculating consecutive faults:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to calculate consecutive locomotive faults",
    });
  }
});

export default router;
