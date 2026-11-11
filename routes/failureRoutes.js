import { Router } from "express";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import mongoose from "mongoose";

import InspectionItem from "../models/inspectionItem.js";

import Failure from "../models/failures.js";

import { requireAuth, requireAdmin } from "../middleware/auth.js";

dotenv.config();

const router = Router();

/* ============================================================
   ENGINEEASE - FAULT MANAGEMENT
   AUTOMATIC INSPECTION SYNCHRONISATION
============================================================ */

/* ============================================================
   HELPERS
============================================================ */

const makeCode = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const isValidId = (id) => mongoose.isValidObjectId(id);

const isValidName = (value) =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.trim().length <= 150;

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const handleError = (res, error) => {
  console.error("Fault management error:", error);

  if (error.status) {
    return res.status(error.status).json({
      message: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      message: "Fault name or code already exists",
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      message: error.message,
    });
  }

  return res.status(500).json({
    message: "Internal server error",
  });
};

/* ============================================================
   DATABASE TRANSACTION HELPER
============================================================ */

const runTransaction = async (callback) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      result = await callback(session);
    });

    return result;
  } finally {
    await session.endSession();
  }
};

/* ============================================================
   INSPECTION SYNCHRONISATION

   IMPORTANT:
   The Inspection model must support the fields below.

   If the model uses a different schema, update its
   field mapping before enabling this functionality.
============================================================ */

/* ============================================================
   AUTOMATIC FAULT -> INSPECTION ITEM SYNCHRONISATION
============================================================ */

const syncInspection = async (fault, session) => {
  const inspectionData = {
    failure_id: fault._id,
    code: fault.code,
    name: fault.failure,
    is_active: fault.is_active !== false,
    display_order: fault.display_order ?? 0,
  };

  /* FIND EXISTING ITEM BY FAULT ID */

  let inspectionItem = await InspectionItem.findOne({
    failure_id: fault._id,
  }).session(session);

  /* MATCH EXISTING ITEMS BY CODE */

  if (!inspectionItem && fault.code) {
    inspectionItem = await InspectionItem.findOne({
      code: fault.code,
    }).session(session);

    if (
      inspectionItem?.failure_id &&
      String(inspectionItem.failure_id) !== String(fault._id)
    ) {
      const error = new Error("Inspection item is linked to another fault");
      error.status = 409;
      throw error;
    }
  }

  /* UPDATE EXISTING INSPECTION ITEM */

  if (inspectionItem) {
    if (inspectionItem.code !== fault.code) {
      const error = new Error("Linked inspection item has a different code");
      error.status = 409;
      throw error;
    }

    inspectionItem.set(inspectionData);

    await inspectionItem.save({ session });

    return inspectionItem;
  }

  /* CREATE NEW INSPECTION ITEM */

  const [newInspectionItem] = await InspectionItem.create([inspectionData], {
    session,
  });

  return newInspectionItem;
};

/* ============================================================
   EMAIL TRANSPORTER
============================================================ */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ============================================================
   SEND EMAIL FUNCTION
============================================================ */

const sendEmail = async (to, subject, text, html) => {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html,
  });

  console.log("Email sent:", info.response);

  return info;
};

/* ============================================================
   GET VISIBLE FAILURES
   EXISTING MOBILE-COMPATIBLE ENDPOINT
============================================================ */

router.get("/", async (req, res) => {
  try {
    const failureList = await Failure.find({
      is_active: { $ne: false },
    })
      .sort({
        display_order: 1,
        _id: 1,
      })
      .lean();

    return res.status(200).json(failureList);
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   EMAIL ROUTE - EXISTING FUNCTIONALITY
============================================================ */

router.post("/email", async (req, res) => {
  const { to, subject, text, html } = req.body;

  try {
    if (!to) {
      return res.status(400).json({
        error: "Recipient email is required",
      });
    }

    await sendEmail(
      to,
      subject || "Sri Lanka Railway Notification",
      text || "",
      html || "",
    );

    return res.status(200).json({
      message: "Email sent successfully",
    });
  } catch (error) {
    console.error("Email route error:", error);

    return res.status(500).json({
      error: "Failed to send email",
    });
  }
});

/* ============================================================
   GET FAILURES BY DRIVER COM NUMBER
   PRESERVED FOR COMPATIBILITY
============================================================ */

router.get("/failuresByDriverComnumber", async (req, res) => {
  const { drivcerComNum } = req.query;

  try {
    const failureList = await Failure.find({
      drivcerComNum,
    }).sort({
      updatedAt: -1,
    });

    return res.status(200).json(failureList);
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   ADMIN AUTHENTICATION
   ORIGINAL JWT AUTHENTICATION PRESERVED
============================================================ */

router.use("/admin", requireAuth, requireAdmin);

/* ============================================================
   ADMIN - GET ALL FAULTS
============================================================ */

router.get("/admin", async (req, res) => {
  try {
    const failures = await Failure.find()
      .sort({
        display_order: 1,
        _id: 1,
      })
      .lean();

    return res.status(200).json({
      total: failures.length,
      active: failures.filter((item) => item.is_active !== false).length,
      hidden: failures.filter((item) => item.is_active === false).length,
      failures,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   ADMIN - ADD FAULT
   AUTOMATICALLY CREATE MATCHING INSPECTION
============================================================ */

router.post("/admin", async (req, res) => {
  try {
    const { failure, main_type } = req.body || {};

    if (!isValidName(failure)) {
      return res.status(400).json({
        message: "Valid fault name is required",
      });
    }

    if (main_type !== undefined && !isValidName(main_type)) {
      return res.status(400).json({
        message: "Invalid fault category",
      });
    }

    const cleanName = failure.trim();
    const code = makeCode(cleanName);

    if (!/^[a-z][a-z0-9_]*$/.test(code) || code.length > 100) {
      return res.status(400).json({
        message: "Fault name must generate a valid code",
      });
    }

    const result = await runTransaction(async (session) => {
      const existing = await Failure.findOne({
        $or: [{ failure: cleanName }, { code }],
      }).session(session);

      if (existing) {
        throw createError(409, "Fault already exists");
      }

      const last = await Failure.findOne()
        .sort({
          display_order: -1,
        })
        .select("display_order")
        .session(session);

      const nextOrder = (last?.display_order || 0) + 1;

      /* ----------------------------------------------------
           STEP 1 - CREATE FAULT
        ---------------------------------------------------- */

      const [newFailure] = await Failure.create(
        [
          {
            main_type: main_type?.trim() || "running condition",
            failure: cleanName,
            code,
            is_active: true,
            display_order: nextOrder,
          },
        ],
        { session },
      );

      /* ----------------------------------------------------
           STEP 2 - CREATE MATCHING INSPECTION
        ---------------------------------------------------- */
      const newInspection = await syncInspection(newFailure, session);

      return {
        failure: newFailure,
        inspection: newInspection,
      };
    });

    return res.status(201).json({
      message: "Fault and inspection created successfully",
      failure: result.failure,
      inspection: result.inspection,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   ADMIN - EDIT FAULT
   SYNCHRONISE INSPECTION
============================================================ */

router.put("/admin/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { failure, main_type } = req.body || {};

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid fault ID",
      });
    }

    const updates = {};

    if (failure !== undefined) {
      if (!isValidName(failure)) {
        return res.status(400).json({
          message: "Invalid fault name",
        });
      }

      updates.failure = failure.trim();
    }

    if (main_type !== undefined) {
      if (!isValidName(main_type)) {
        return res.status(400).json({
          message: "Invalid category",
        });
      }

      updates.main_type = main_type.trim();
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        message: "No valid changes provided",
      });
    }

    const updated = await runTransaction(async (session) => {
      const fault = await Failure.findByIdAndUpdate(
        id,
        { $set: updates },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!fault) {
        throw createError(404, "Fault not found");
      }

      await syncInspection(fault, session);

      return fault;
    });

    return res.status(200).json({
      message: "Fault and inspection updated successfully",
      failure: updated,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   ADMIN - SHOW / HIDE FAULT
============================================================ */

router.patch("/admin/:id/visibility", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body || {};

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid fault ID",
      });
    }

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        message: "is_active must be boolean",
      });
    }

    const updated = await runTransaction(async (session) => {
      const fault = await Failure.findByIdAndUpdate(
        id,
        {
          $set: { is_active },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!fault) {
        throw createError(404, "Fault not found");
      }

      await syncInspection(fault, session);

      return fault;
    });

    return res.status(200).json({
      message: is_active ? "Fault is now visible" : "Fault is now hidden",
      failure: updated,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   ADMIN - REORDER FAULTS
   SYNCHRONISE INSPECTION DISPLAY ORDER
============================================================ */

router.patch("/admin/reorder", async (req, res) => {
  try {
    const { ordered_ids } = req.body || {};

    if (
      !Array.isArray(ordered_ids) ||
      !ordered_ids.length ||
      ordered_ids.some((id) => !isValidId(id))
    ) {
      return res.status(400).json({
        message: "Valid ordered_ids array required",
      });
    }

    const ids = ordered_ids.map(String);

    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({
        message: "Duplicate IDs are not allowed",
      });
    }

    await runTransaction(async (session) => {
      const allFailures = await Failure.find()
        .select("_id")
        .session(session)
        .lean();

      const databaseIds = new Set(allFailures.map((item) => String(item._id)));

      if (
        ids.length !== databaseIds.size ||
        ids.some((id) => !databaseIds.has(id))
      ) {
        throw createError(400, "Provide all existing fault IDs exactly once");
      }

      const operations = ids.map((id, index) => ({
        updateOne: {
          filter: { _id: id },
          update: {
            $set: {
              display_order: index + 1,
            },
          },
        },
      }));

      await Failure.bulkWrite(operations, {
        ordered: true,
        session,
      });

      const updatedFaults = await Failure.find()
        .sort({
          display_order: 1,
          _id: 1,
        })
        .session(session);

      for (const fault of updatedFaults) {
        await syncInspection(fault, session);
      }
    });

    return res.status(200).json({
      message: "Fault and inspection order updated successfully",
    });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   ADMIN - REMOVE FAULT
   SOFT DELETE / ARCHIVE
============================================================ */

router.delete("/admin/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        message: "Invalid fault ID",
      });
    }

    const updated = await runTransaction(async (session) => {
      const fault = await Failure.findByIdAndUpdate(
        id,
        {
          $set: {
            is_active: false,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        },
      );

      if (!fault) {
        throw createError(404, "Fault not found");
      }

      await syncInspection(fault, session);

      return fault;
    });

    return res.status(200).json({
      message: "Fault archived successfully. Historical data preserved.",
      failure: updated,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

export default router;
