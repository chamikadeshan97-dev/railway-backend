
import { Types } from "mongoose";
import { Router } from "express";
import mongoose from "mongoose";
import EngineFailure from "../models/engineFailures.js";
import Engine from "../models/engine.js";
import EngineInspection from "../models/engineInspection.js";
import InspectionItem from "../models/inspectionItem.js";
import TripCards from "../models/tripCards.js";

import {
  requireAuth,
  requireRoles,
} from "../middleware/auth.js";

const router = Router();

/* ============================================================
   HELPERS
============================================================ */

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const getErrorResponse = (error) => {
  if (error?.name === "ValidationError") {
    return {
      status: 400,
      message: error.message,
    };
  }

  if (error?.name === "CastError") {
    return {
      status: 400,
      message: "Invalid submitted data.",
    };
  }

  if (error?.code === 11000) {
    return {
      status: 409,
      message: "A conflicting record already exists.",
    };
  }

  return {
    status: 500,
    message: "Failed to create trip card and inspection.",
  };
};

/* ============================================================
   GET ALL TRIP CARDS
============================================================ */

router.get("/", async (req, res) => {
  try {
    const trips = await TripCards.find().sort({
      updatedAt: -1,
    });

    return res.status(200).json(trips);

  } catch (error) {
    console.error("Error fetching trip cards:", error);

    return res.status(500).json({
      error: "Failed to fetch Trip Cards",
    });
  }
});

/* ============================================================
   CREATE TRIP CARD WITH DYNAMIC ENGINE INSPECTION
============================================================ */


/* ============================================================
   CREATE TRIP CARD WITH INSPECTION COMMENTS
   AND AUTOMATIC LOCOMOTIVE FAILURES
============================================================ */

router.post(
  "/",
  requireAuth,
  requireRoles("driver"),
  async (req, res) => {
    try {
      const {
        trainNumber,
        assistanceComNum,
        assistanceName = "",
        engine,
        isDoubleSet = false,
        doubleSetLink = "",
        specialNoticedIssues = "",
        inspectionResults,
        inspectionComments = {},
      } = req.body || {};

      /* ======================================================
         VALIDATE JOURNEY DETAILS
      ====================================================== */

      if (
        !isNonEmptyString(trainNumber) ||
        !isNonEmptyString(assistanceComNum) ||
        !isNonEmptyString(engine)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Train number, assistant computer number and engine are required.",
        });
      }

      if (
        typeof assistanceName !== "string" ||
        typeof isDoubleSet !== "boolean" ||
        typeof doubleSetLink !== "string" ||
        typeof specialNoticedIssues !== "string" ||
        specialNoticedIssues.trim().length > 1000
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid trip card information.",
        });
      }

      if (isDoubleSet && !doubleSetLink.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Linked locomotive is required for a double-set trip.",
        });
      }

      /* ======================================================
         VALIDATE INSPECTION DATA
      ====================================================== */

      if (
        !isPlainObject(inspectionResults) ||
        !isPlainObject(inspectionComments)
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Inspection results and comments must be objects.",
        });
      }

      /* ======================================================
         VALIDATE ENGINE
      ====================================================== */

      const engineSubClass = engine.trim();

      const existingEngine = await Engine.findOne({
        subClass: engineSubClass,
      }).lean();

      if (!existingEngine) {
        return res.status(404).json({
          success: false,
          message: "Selected locomotive not found.",
        });
      }

      /* ======================================================
         AUTHENTICATED DRIVER
      ====================================================== */

      const driverComNum = String(
        req.user.comNum || ""
      ).trim().toUpperCase();

      const driverName = String(
        req.user.name || ""
      ).trim();

      if (!driverComNum) {
        return res.status(403).json({
          success: false,
          message:
            "Driver account information is incomplete.",
        });
      }

      /* ======================================================
         DATABASE TRANSACTION
      ====================================================== */

      const session = await mongoose.startSession();

      let newTripCard;

      try {
        await session.withTransaction(async () => {
          /* ==================================================
             GET ACTIVE INSPECTION ITEMS
          ================================================== */

          const activeItems = await InspectionItem.find({
            is_active: true,
          })
            .sort({
              display_order: 1,
              _id: 1,
            })
            .session(session)
            .lean();

          if (activeItems.length === 0) {
            const error = new Error(
              "No active inspection checklist is available."
            );

            error.statusCode = 503;
            throw error;
          }

          const activeCodes = activeItems.map(
            (item) => item.code
          );

          const expectedCodes = new Set(activeCodes);

          const submittedCodes = Object.keys(
            inspectionResults
          );

          /* ==================================================
             VALIDATE INSPECTION RESULTS
          ================================================== */

          const missingFields = activeCodes.filter(
            (code) =>
              !Object.prototype.hasOwnProperty.call(
                inspectionResults,
                code
              ) ||
              typeof inspectionResults[code] !== "boolean"
          );

          const unknownFields = submittedCodes.filter(
            (code) => !expectedCodes.has(code)
          );

          if (
            missingFields.length > 0 ||
            unknownFields.length > 0
          ) {
            const error = new Error(
              "Inspection results do not match the current checklist. Refresh the checklist and try again."
            );

            error.statusCode = 400;

            error.details = {
              missingFields,
              unknownFields,
            };

            throw error;
          }

          /* ==================================================
             VALIDATE INSPECTION COMMENTS
          ================================================== */

          const invalidComments = Object.entries(
            inspectionComments
          )
            .filter(
              ([code, comment]) =>
                !expectedCodes.has(code) ||
                typeof comment !== "string" ||
                comment.trim().length > 1000
            )
            .map(([code]) => code);

          if (invalidComments.length > 0) {
            const error = new Error(
              "Invalid inspection comments."
            );

            error.statusCode = 400;

            error.details = {
              invalidComments,
            };

            throw error;
          }

          /* ==================================================
             BUILD VALIDATED RESULTS
          ================================================== */

          const validatedResults = Object.fromEntries(
            activeCodes.map((code) => [
              code,
              inspectionResults[code],
            ])
          );

          /* ==================================================
             BUILD VALIDATED COMMENTS
             STORE COMMENTS FOR FAILED ITEMS ONLY
          ================================================== */

          const validatedComments = Object.fromEntries(
            activeCodes
              .filter(
                (code) =>
                  validatedResults[code] === false
              )
              .map((code) => [
                code,
                String(
                  inspectionComments[code] || ""
                ).trim(),
              ])
              .filter(([, comment]) => comment.length > 0)
          );

          /* ==================================================
             CREATE TRIP CARD
          ================================================== */

          const createdTrips = await TripCards.create(
            [
              {
                date: new Date(),

                trainNumber: trainNumber.trim(),

                driverComNum,
                driverName,

                assistanceComNum:
                  assistanceComNum.trim().toUpperCase(),

                assistanceName:
                  assistanceName.trim(),

                engine: engineSubClass,

                isInspectionDone: true,

                inspectionResults: validatedResults,

                inspectionComments: validatedComments,

                isDoubleSet,

                doubleSetLink: isDoubleSet
                  ? doubleSetLink.trim()
                  : "",

                specialNoticedIssues:
                  specialNoticedIssues.trim(),
              },
            ],
            { session }
          );

          newTripCard = createdTrips[0];

          /* ==================================================
             CREATE LINKED ENGINE INSPECTION
          ================================================== */

          await EngineInspection.create(
            [
              {
                engine: engineSubClass,

                tripCardId: newTripCard._id,

                trainNumber: newTripCard.trainNumber,

                driverComNum,

                inspectedAt: new Date(),

                inspectionResults: validatedResults,

                specialNoticedIssues:
                  specialNoticedIssues.trim(),
              },
            ],
            { session }
          );

          /* ==================================================
             IDENTIFY FAILED INSPECTION ITEMS
          ================================================== */

          const failedItems = activeItems.filter(
            (item) =>
              validatedResults[item.code] === false
          );

          /* ==================================================
             BUILD AUTOMATIC FAILURES
          ================================================== */

          const automaticFailures = failedItems.map(
            (item) => {
              const failureName = String(
                item.name ||
                item.label ||
                item.title ||
                item.code
              ).trim();

              const driverComment =
                validatedComments[item.code] || "";

              return {
                date: newTripCard.date,

                failure: failureName,

                failureSource: "TripCardInspection",

                inspectionItemCode: item.code,

                tripCardId: newTripCard._id,

                engine: newTripCard.engine,

                trainNumber: newTripCard.trainNumber,

                // Existing model field spelling.
                drivcerComNum: driverComNum,

                driverName,

                /* ============================================
                   DRIVER COMMENT
                ============================================ */

                comments: driverComment
                  ? driverComment
                  : `Automatically detected during Trip Card inspection. ${failureName} was marked as Not Working.`,

                status: "Pending",

                /* ============================================
                   FOREMAN ASSIGNMENT
                ============================================ */

                assignedForeman: null,

                assignedForemanComNum: "",

                assignedForemanName: "",

                foremanAssignedAt: null,

                foremanAssignedBy: null,

                foremanAssignmentHistory: [],

                /* ============================================
                   MAINTENANCE INFORMATION
                ============================================ */

                maintenanceNotes: "",

                LFCComNum: "",

                assingedTo: "",

                startedOn: null,

                completedOn: null,
              };
            }
          );

          /* ==================================================
             CREATE AUTOMATIC FAILURES
          ================================================== */

          if (automaticFailures.length > 0) {
            await EngineFailure.create(
              automaticFailures,
              {
                session,
                ordered: true,
              }
            );
          }
        });
      } finally {
        await session.endSession();
      }

      /* ======================================================
         SUCCESS
      ====================================================== */

      return res.status(201).json(newTripCard);

    } catch (error) {
      console.error(
        "Error creating Trip Card:",
        error
      );

      const response = getErrorResponse(error);

      return res.status(
        error.statusCode || response.status
      ).json({
        success: false,

        message: error.statusCode
          ? error.message
          : response.message,

        ...(error.details || {}),
      });
    }
  }
);

/* ============================================================
   GET TRIPS BY TRAIN NUMBER
============================================================ */

router.get("/tripsByTrainNumber", async (req, res) => {
  const { trainNumber } = req.query;

  try {
    const trips = await TripCards.find({
      trainNumber,
    }).sort({
      updatedAt: -1,
    });

    return res.status(200).json(trips);

  } catch (error) {
    console.error("Error fetching trips by train number:", error);

    return res.status(500).json({
      error: "Failed to fetch Trip Cards",
    });
  }
});

/* ============================================================
   DELETE TRIP CARD BY ID
============================================================ */

router.delete("/tripCardById", async (req, res) => {
  const { Id } = req.query;

  if (!Id || !Types.ObjectId.isValid(Id)) {
    return res.status(400).json({
      error: "Invalid ID format",
    });
  }

  try {
    const trip = await TripCards.findByIdAndDelete(Id);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found",
      });
    }

    return res.status(200).json({
      message: "Trip deleted successfully",
      trip,
    });

  } catch (error) {
    console.error("Error deleting trip:", error);

    return res.status(500).json({
      error: "Failed to delete trip",
    });
  }
});

/* ============================================================
   GET TRIP CARD BY ID
============================================================ */

router.get("/tripCardById", async (req, res) => {
  const { Id } = req.query;

  if (!Id || !Types.ObjectId.isValid(Id)) {
    return res.status(400).json({
      error: "Invalid ID format",
    });
  }

  try {
    const trip = await TripCards.findById(Id);

    if (!trip) {
      return res.status(404).json({
        error: "Trip not found",
      });
    }

    return res.status(200).json(trip);

  } catch (error) {
    console.error("Error fetching trip:", error);

    return res.status(500).json({
      error: "Failed to fetch Trip",
    });
  }
});

/* ============================================================
   GET TRIP BY SUB CLASS
============================================================ */

router.get("/ss", async (req, res) => {
  const { subClass } = req.query;

  try {
    const trip = await TripCards.findOne({
      subClass,
    });

    return res.status(200).json(trip || []);

  } catch (error) {
    console.error("Error fetching trip by subclass:", error);

    return res.status(500).json({
      error: "Failed to fetch Type",
    });
  }
});

/* ============================================================
   GET TRIPS BY ENGINE NUMBER
============================================================ */

router.get("/tripsByEnginenumber", async (req, res) => {
  const { engine } = req.query;

  try {
    const trips = await TripCards.find({
      engine,
    }).sort({
      updatedAt: -1,
    });

    return res.status(200).json(trips);

  } catch (error) {
    console.error("Error fetching trips by engine:", error);

    return res.status(500).json({
      error: "Failed to fetch Trip Cards",
    });
  }
});

/* ============================================================
   GET TRIPS BY DRIVER COM NUMBER
============================================================ */

router.get("/tripsByDriverComnumber", async (req, res) => {
  const { driverComNum } = req.query;

  try {
    const trips = await TripCards.find({
      driverComNum,
    }).sort({
      updatedAt: -1,
    });

    return res.status(200).json(trips);

  } catch (error) {
    console.error(
      "Error fetching trips by driver com number:",
      error
    );

    return res.status(500).json({
      error: "Failed to fetch Trips",
    });
  }
});

export default router;
