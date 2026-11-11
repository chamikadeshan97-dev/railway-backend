
import { Router } from "express";
import { Types } from "mongoose";

import EngineFailure from "../models/engineFailures.js";
import TripCards from "../models/tripCards.js";
import User from "../models/users.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

/* ============================================================
   ASSIGN / REASSIGN FOREMAN TO ENGINE FAILURE
   ADMIN ONLY
============================================================ */

router.patch(
  "/:id/assign-foreman",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { foremanId } = req.body || {};

      /* ======================================================
         VALIDATE IDS
      ====================================================== */

      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid Engine Failure ID",
        });
      }

      if (
        typeof foremanId !== "string" ||
        !Types.ObjectId.isValid(foremanId)
      ) {
        return res.status(400).json({
          message: "Valid Foreman ID is required",
        });
      }

      /* ======================================================
         FIND ENGINE FAILURE
      ====================================================== */

      const failure = await EngineFailure.findById(id);

      if (!failure) {
        return res.status(404).json({
          message: "Engine Failure not found",
        });
      }

      /* ======================================================
         FIND FOREMAN
      ====================================================== */

      const foreman = await User.findById(foremanId);

      if (!foreman) {
        return res.status(404).json({
          message: "Selected Foreman not found",
        });
      }

      /* ======================================================
         VALIDATE FOREMAN
      ====================================================== */

      const foremanComNum = String(foreman.comNum || "")
        .trim()
        .toUpperCase();

      const foremanName = String(
        foreman.name || "",
      ).trim();

      if (
        foreman.role !== "foreman" ||
        !foremanComNum.startsWith("F")
      ) {
        return res.status(400).json({
          message: "Selected user is not a valid Foreman",
        });
      }

      if (foreman.isVerified !== true) {
        return res.status(400).json({
          message: "Selected Foreman account is not verified",
        });
      }

      if (!foremanName) {
        return res.status(400).json({
          message: "Selected Foreman has no valid name",
        });
      }

      /* ======================================================
         GET AUTHENTICATED ADMIN ID
      ====================================================== */

      const adminId =
        req.user?._id ||
        req.user?.id ||
        req.user?.userId ||
        req.auth?.userId;

      if (
        !adminId ||
        !Types.ObjectId.isValid(adminId)
      ) {
        console.error(
          "Admin ID missing from authenticated request",
          {
            userKeys: Object.keys(req.user || {}),
            authKeys: Object.keys(req.auth || {}),
          },
        );

        return res.status(401).json({
          message: "Authenticated Admin ID not available",
        });
      }

      const admin = await User.findById(
        adminId,
      ).select("_id role isVerified");

      if (!admin || admin.role !== "admin") {
        return res.status(403).json({
          message: "Only Admin users can assign Foremen",
        });
      }

      const assignedBy = admin._id;

      /* ======================================================
         PREVENT DUPLICATE ASSIGNMENT
      ====================================================== */

      if (
        failure.assignedForeman &&
        String(failure.assignedForeman) ===
          String(foreman._id)
      ) {
        return res.status(200).json({
          message:
            "This Foreman is already assigned to the failure",
          failure,
        });
      }

      /* ======================================================
         PREPARE ASSIGNMENT
      ====================================================== */

      const assignedAt = new Date();

      const isReassignment = Boolean(
        failure.assignedForeman,
      );

      /* ======================================================
         UPDATE FOREMAN INFORMATION
      ====================================================== */

      failure.assignedForeman = foreman._id;

      failure.assignedForemanComNum =
        foremanComNum;

      failure.assignedForemanName =
        foremanName;

      failure.foremanAssignedAt = assignedAt;

      failure.foremanAssignedBy = assignedBy;

      /* ======================================================
         PRESERVE ASSIGNMENT HISTORY
      ====================================================== */

      if (
        !Array.isArray(
          failure.foremanAssignmentHistory,
        )
      ) {
        failure.foremanAssignmentHistory = [];
      }

      failure.foremanAssignmentHistory.push({
        foreman: foreman._id,
        foremanComNum,
        foremanName,
        assignedBy,
        assignedAt,
      });

      /* ======================================================
         SAVE ENGINE FAILURE
      ====================================================== */

      await failure.save();

      return res.status(200).json({
        message: isReassignment
          ? "Foreman reassigned successfully"
          : "Foreman assigned successfully",
        failure,
      });
    } catch (err) {
      console.error(
        "Error assigning Foreman:",
        err,
      );

      if (err.name === "ValidationError") {
        return res.status(400).json({
          message: err.message,
        });
      }

      return res.status(500).json({
        message:
          "Failed to assign Foreman to Engine Failure",
      });
    }
  },
);

/* ============================================================
   CREATE ENGINE FAILURE
============================================================ */

router.post("/", async (req, res) => {
  try {
    const {
      date,
      failure,
      drivcerComNum,
      driverName,
      engine,
      trainNumber,
      tripCardId,
      comments,
    } = req.body;

    /* ========================================================
       VALIDATE REQUIRED INFORMATION
    ======================================================== */

    if (
      typeof failure !== "string" ||
      !failure.trim() ||
      typeof drivcerComNum !== "string" ||
      !drivcerComNum.trim() ||
      typeof engine !== "string" ||
      !engine.trim() ||
      typeof trainNumber !== "string" ||
      !trainNumber.trim()
    ) {
      return res.status(400).json({
        message: "Missing required failure information",
      });
    }

    /* ========================================================
       VALIDATE DATE
    ======================================================== */

    if (
      date != null &&
      Number.isNaN(new Date(date).getTime())
    ) {
      return res.status(400).json({
        message: "Invalid failure date",
      });
    }

    /* ========================================================
       VERIFY TRIP CARD IF PROVIDED
    ======================================================== */

    let verifiedTripCardId = null;

    if (tripCardId != null) {
      if (!Types.ObjectId.isValid(tripCardId)) {
        return res.status(400).json({
          message: "Invalid trip card ID",
        });
      }

      const trip = await TripCards.findById(
        tripCardId,
      );

      if (!trip) {
        return res.status(404).json({
          message: "Trip card not found",
        });
      }

      if (
        trip.engine !== engine.trim() ||
        trip.trainNumber !== trainNumber.trim()
      ) {
        return res.status(400).json({
          message:
            "Engine or train number does not match the selected trip",
        });
      }

      if (
        trip.driverComNum !==
        drivcerComNum.trim()
      ) {
        return res.status(400).json({
          message:
            "Driver does not match the selected trip",
        });
      }

      verifiedTripCardId = trip._id;
    }

    /* ========================================================
       CREATE FAILURE REPORT
    ======================================================== */

    const newEngineFailure = new EngineFailure({
      date: date
        ? new Date(date)
        : new Date(),

      failure: failure.trim(),

      drivcerComNum: drivcerComNum.trim(),

      driverName,

      engine: engine.trim(),

      trainNumber: trainNumber.trim(),

      tripCardId: verifiedTripCardId,

      comments: comments?.trim() || "",

      status: "pending",
    });

    await newEngineFailure.save();

    return res.status(201).json(
      newEngineFailure,
    );
  } catch (err) {
    console.error(
      "Error creating engine failure:",
      err,
    );

    return res.status(500).json({
      message: "Failed to create Engine Failure",
    });
  }
});

/* ============================================================
   GET ALL ENGINE FAILURES
============================================================ */

router.get("/", async (req, res) => {
  try {
    const failures = await EngineFailure.find()
      .sort({
        updatedAt: -1,
      });

    return res.status(200).json(failures);
  } catch (err) {
    console.error(
      "Error fetching engine failures:",
      err,
    );

    return res.status(500).json({
      error: "Failed to fetch Engine Failures",
    });
  }
});

/* ============================================================
   GET FAILURES BY TRIP CARD ID
============================================================ */

router.get(
  "/engineFailuresByTripCard",
  async (req, res) => {
    try {
      const { tripCardId } = req.query;

      if (
        !tripCardId ||
        !Types.ObjectId.isValid(tripCardId)
      ) {
        return res.status(400).json({
          message:
            "Valid trip card ID is required",
        });
      }

      const trip = await TripCards.findById(
        tripCardId,
      );

      if (!trip) {
        return res.status(404).json({
          message: "Trip card not found",
        });
      }

      const failures = await EngineFailure.find({
        tripCardId: trip._id,
      }).sort({
        date: -1,
        createdAt: -1,
      });

      return res.status(200).json({
        tripCardId: trip._id,
        engine: trip.engine,
        trainNumber: trip.trainNumber,
        totalFailures: failures.length,
        failures,
      });
    } catch (err) {
      console.error(
        "Error fetching trip failures:",
        err,
      );

      return res.status(500).json({
        message:
          "Failed to fetch failures for this trip",
      });
    }
  },
);

/* ============================================================
   GET ENGINE FAILURES BY DRIVER COM NUMBER
============================================================ */

router.get(
  "/engineFailuresByDrivcerComNum",
  async (req, res) => {
    const { drivcerComNum } = req.query;

    try {
      const failures = await EngineFailure.find({
        drivcerComNum,
      }).sort({
        updatedAt: -1,
      });

      return res.status(200).json(failures);
    } catch (err) {
      console.error(
        "Error fetching failures by driver:",
        err,
      );

      return res.status(500).json({
        error: "Failed to fetch failures",
      });
    }
  },
);

/* ============================================================
   GET ENGINE FAILURES BY ENGINE
============================================================ */

router.get(
  "/engineFailureByEngine",
  async (req, res) => {
    const { engine } = req.query;

    try {
      const failures = await EngineFailure.find({
        engine,
      }).sort({
        updatedAt: -1,
      });

      return res.status(200).json(failures);
    } catch (err) {
      console.error(
        "Error fetching failures by engine:",
        err,
      );

      return res.status(500).json({
        error:
          "Failed to fetch failures for this engine",
      });
    }
  },
);

/* ============================================================
   GET ENGINE FAILURES BY TRAIN NUMBER
============================================================ */

router.get(
  "/engineFailureByTrainNumber",
  async (req, res) => {
    const { trainNumber } = req.query;

    try {
      const failures = await EngineFailure.find({
        trainNumber,
      }).sort({
        updatedAt: -1,
      });

      return res.status(200).json(failures);
    } catch (err) {
      console.error(
        "Error fetching failures by train:",
        err,
      );

      return res.status(500).json({
        error:
          "Failed to fetch failures for this train number",
      });
    }
  },
);

/* ============================================================
   GET ENGINE FAILURE BY ID
============================================================ */

router.get(
  "/engineFailureById",
  async (req, res) => {
    const { id } = req.query;

    if (
      !id ||
      !Types.ObjectId.isValid(id)
    ) {
      return res.status(400).json({
        message: "Invalid failure ID",
      });
    }

    try {
      const failure =
        await EngineFailure.findById(id);

      if (!failure) {
        return res.status(404).json({
          error: "Engine Failure not found",
        });
      }

      return res.status(200).json(failure);
    } catch (err) {
      console.error(
        "Error fetching engine failure:",
        err,
      );

      return res.status(500).json({
        error:
          "Failed to fetch Engine Failure",
      });
    }
  },
);

/* ============================================================
   UPDATE ENGINE FAILURE BY ID
   ADMIN / ASSIGNED FOREMAN ONLY
============================================================ */

router.put(
  "/updateById",
  requireAuth,
  async (req, res) => {
    try {
      const { id, ...updateData } =
        req.body || {};

      /* ======================================================
         VALIDATE FAILURE ID
      ====================================================== */

      if (
        !id ||
        !Types.ObjectId.isValid(String(id))
      ) {
        return res.status(400).json({
          message:
            "Valid Engine Failure ID is required",
        });
      }

      /* ======================================================
         GET AUTHENTICATED USER
      ====================================================== */

      const userId =
        req.user?._id ||
        req.user?.id ||
        req.user?.userId ||
        req.auth?.userId;

      if (
        !userId ||
        !Types.ObjectId.isValid(String(userId))
      ) {
        return res.status(401).json({
          message:
            "Authenticated User ID not available",
        });
      }

      const user = await User.findById(
        userId,
      ).select(
        "_id name comNum role isVerified",
      );

      if (!user) {
        return res.status(401).json({
          message:
            "Authenticated user not found",
        });
      }

      const role = String(
        user.role || "",
      ).toLowerCase();

      if (
        !["admin", "foreman"].includes(role)
      ) {
        return res.status(403).json({
          message:
            "Only Admins and assigned Foremen can update failures",
        });
      }

      if (user.isVerified !== true) {
        return res.status(403).json({
          message:
            "Your account is not verified",
        });
      }

      /* ======================================================
         FIND FAILURE
      ====================================================== */

      const failure =
        await EngineFailure.findById(id);

      if (!failure) {
        return res.status(404).json({
          message:
            "Engine Failure not found",
        });
      }

      /* ======================================================
         VERIFY FOREMAN ASSIGNMENT
      ====================================================== */

      if (role === "foreman") {
        if (
          !failure.assignedForeman ||
          String(failure.assignedForeman) !==
            String(user._id)
        ) {
          return res.status(403).json({
            message:
              "This failure is not assigned to your account",
          });
        }
      }

      /* ======================================================
         ALLOWED UPDATE FIELDS
      ====================================================== */

      const allowedFields = [
        "comments",
        "maintenanceNotes",
        "status",
        "startedOn",
        "completedOn",
      ];

      const safeUpdate = {};

      for (const field of allowedFields) {
        if (
          Object.prototype.hasOwnProperty.call(
            updateData,
            field,
          )
        ) {
          safeUpdate[field] =
            updateData[field];
        }
      }

      if (
        Object.keys(safeUpdate).length === 0
      ) {
        return res.status(400).json({
          message:
            "No valid update fields supplied",
        });
      }

      /* ======================================================
         VALIDATE MAINTENANCE NOTES
      ====================================================== */

      if (
        safeUpdate.maintenanceNotes !==
        undefined
      ) {
        if (
          typeof safeUpdate.maintenanceNotes !==
            "string" ||
          safeUpdate.maintenanceNotes.length >
            5000
        ) {
          return res.status(400).json({
            message:
              "Maintenance notes must be text up to 5000 characters",
          });
        }

        safeUpdate.maintenanceNotes =
          safeUpdate.maintenanceNotes.trim();
      }

      /* ======================================================
         VALIDATE STATUS TRANSITIONS
      ====================================================== */

      const normalizeStatus = value =>
        String(value || "pending")
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, "");

      const currentStatus =
        normalizeStatus(failure.status);

      if (
        safeUpdate.status !== undefined
      ) {
        const nextStatus =
          normalizeStatus(
            safeUpdate.status,
          );

        const allowedTransitions = {
          pending: ["inprogress"],
          inprogress: ["completed"],
          completed: [],
        };

        if (
          nextStatus !== currentStatus &&
          !(
            allowedTransitions[
              currentStatus
            ] || []
          ).includes(nextStatus)
        ) {
          return res.status(400).json({
            message:
              "Invalid failure status transition",
          });
        }

        if (
          ![
            "pending",
            "inprogress",
            "completed",
          ].includes(nextStatus)
        ) {
          return res.status(400).json({
            message:
              "Invalid failure status",
          });
        }

        safeUpdate.status =
          nextStatus === "inprogress"
            ? "inProgress"
            : nextStatus;

        if (
          currentStatus === "pending" &&
          nextStatus === "inprogress"
        ) {
          safeUpdate.startedOn =
            new Date();
        }

        if (
          currentStatus === "inprogress" &&
          nextStatus === "completed"
        ) {
          safeUpdate.completedOn =
            new Date();
        }
      }

      /*
       * Prevent clients from independently changing
       * repair timestamps.
       */

      if (
        safeUpdate.status === undefined ||
        normalizeStatus(
          safeUpdate.status,
        ) === currentStatus
      ) {
        delete safeUpdate.startedOn;
        delete safeUpdate.completedOn;
      }

      /* ======================================================
         SAVE UPDATE
      ====================================================== */

      const updatedFailure =
        await EngineFailure.findOneAndUpdate(
          role === "foreman"
            ? {
                _id: failure._id,
                assignedForeman:
                  user._id,
                status:
                  failure.status,
              }
            : {
                _id: failure._id,
                status:
                  failure.status,
              },
          {
            $set: safeUpdate,
          },
          {
            new: true,
            runValidators: true,
          },
        );

      if (!updatedFailure) {
        return res.status(409).json({
          message:
            "Failure assignment or status changed. Refresh and try again.",
        });
      }

      return res.status(200).json(
        updatedFailure,
      );
    } catch (err) {
      console.error(
        "Error updating Engine Failure:",
        err,
      );

      if (
        err.name === "ValidationError"
      ) {
        return res.status(400).json({
          message: err.message,
        });
      }

      return res.status(500).json({
        message:
          "Failed to update Engine Failure",
      });
    }
  },
);

/* ============================================================
   GET ENGINE FAILURES ASSIGNED TO LOGGED-IN FOREMAN
   FOREMAN ONLY
============================================================ */

router.get(
  "/my-assigned",
  requireAuth,
  async (req, res) => {
    try {
      /* ======================================================
         GET AUTHENTICATED USER ID
      ====================================================== */

      const userId =
        req.user?._id ||
        req.user?.id ||
        req.user?.userId ||
        req.auth?.userId;

      if (
        !userId ||
        !Types.ObjectId.isValid(userId)
      ) {
        return res.status(401).json({
          message:
            "Authenticated User ID not available",
        });
      }

      /* ======================================================
         VERIFY LOGGED-IN FOREMAN
      ====================================================== */

      const foreman = await User.findById(
        userId,
      ).select(
        "_id name comNum role isVerified",
      );

      if (!foreman) {
        return res.status(404).json({
          message:
            "Authenticated user not found",
        });
      }

      if (
        foreman.role !== "foreman"
      ) {
        return res.status(403).json({
          message:
            "Only Foremen can access assigned failures",
        });
      }

      if (
        foreman.isVerified !== true
      ) {
        return res.status(403).json({
          message:
            "Foreman account is not verified",
        });
      }

      /* ======================================================
         FETCH ONLY ASSIGNED FAILURES
      ====================================================== */

      const failures =
        await EngineFailure.find({
          assignedForeman:
            foreman._id,
        }).sort({
          updatedAt: -1,
          createdAt: -1,
        });

      /* ======================================================
         RETURN ASSIGNED FAILURES
      ====================================================== */

      return res.status(200).json({
        foreman: {
          id: foreman._id,
          name: foreman.name,
          comNum: foreman.comNum,
        },

        totalFailures:
          failures.length,

        failures,
      });
    } catch (err) {
      console.error(
        "Error fetching assigned Foreman failures:",
        err,
      );

      return res.status(500).json({
        message:
          "Failed to fetch assigned failures",
      });
    }
  },
);

/* ============================================================
   GET LOGGED-IN FOREMAN FAILURE STATISTICS
   FOREMAN ONLY
============================================================ */

router.get(
  "/my-assigned/stats",
  requireAuth,
  async (req, res) => {
    try {
      /* ======================================================
         GET AUTHENTICATED USER
      ====================================================== */

      const userId =
        req.user?._id ||
        req.user?.id ||
        req.user?.userId ||
        req.auth?.userId;

      if (
        !userId ||
        !Types.ObjectId.isValid(userId)
      ) {
        return res.status(401).json({
          message:
            "Authenticated User ID not available",
        });
      }

      const foreman =
        await User.findById(
          userId,
        ).select(
          "_id name comNum role isVerified",
        );

      if (!foreman) {
        return res.status(404).json({
          message:
            "Authenticated user not found",
        });
      }

      if (
        foreman.role !== "foreman"
      ) {
        return res.status(403).json({
          message:
            "Only Foremen can access these statistics",
        });
      }

      if (
        foreman.isVerified !== true
      ) {
        return res.status(403).json({
          message:
            "Foreman account is not verified",
        });
      }

      /* ======================================================
         AGGREGATE ASSIGNED FAILURE STATISTICS
      ====================================================== */

      const failures =
        await EngineFailure.find({
          assignedForeman:
            foreman._id,
        }).select("status");

      const normalizeStatus = value =>
        String(value || "pending")
          .trim()
          .toLowerCase()
          .replace(
            /[\s_-]+/g,
            "_",
          );

      const stats = {
        total: failures.length,
        pending: 0,
        inProgress: 0,
        completed: 0,
        other: 0,
      };

      failures.forEach(item => {
        const status =
          normalizeStatus(
            item.status,
          );

        if (
          status === "pending"
        ) {
          stats.pending += 1;
        } else if (
          status === "in_progress"
        ) {
          stats.inProgress += 1;
        } else if (
          [
            "completed",
            "resolved",
            "fixed",
          ].includes(status)
        ) {
          stats.completed += 1;
        } else {
          stats.other += 1;
        }
      });

      return res.status(200).json({
        foreman: {
          id: foreman._id,
          name: foreman.name,
          comNum: foreman.comNum,
        },

        stats,
      });
    } catch (err) {
      console.error(
        "Error fetching Foreman failure statistics:",
        err,
      );

      return res.status(500).json({
        message:
          "Failed to fetch Foreman failure statistics",
      });
    }
  },
);

export default router;
