
import { Router } from "express";
import { Types } from "mongoose";

import InspectionItem from "../models/inspectionItem.js";



const router = Router();

/* ============================================================
   HELPERS
============================================================ */

const sortItems = (items) =>
  items.sort(
    (a, b) =>
      a.display_order - b.display_order ||
      String(a._id).localeCompare(String(b._id))
  );

const createCode = (name) =>
  String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const validName = (name) =>
  typeof name === "string" &&
  name.trim().length > 0 &&
  name.trim().length <= 150;

const handleError = (res, error) => {
  if (error.code === 11000) {
    return res.status(409).json({
      message:
        "An inspection item with this code already exists.",
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      message: error.message,
    });
  }

  console.error("Inspection item error:", error);

  return res.status(500).json({
    message: "Inspection operation failed.",
  });
};

/* ============================================================
   GET ACTIVE INSPECTION ITEMS - MOBILE
============================================================ */

router.get("/",  async (req, res) => {
  try {
    const items = await InspectionItem.find({
      is_active: true,
    }).lean();

    return res.status(200).json({
      success: true,
      inspections: sortItems(items),
    });
  } catch (error) {
    return handleError(res, error);
  }
});

/* ============================================================
   GET ALL INSPECTION ITEMS - ADMIN
============================================================ */

router.get(
  "/admin/all",
  

  async (req, res) => {
    try {
      const items = await InspectionItem.find({}).lean();

      return res.status(200).json({
        success: true,
        inspections: sortItems(items),
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

/* ============================================================
   CREATE INSPECTION ITEM - ADMIN
============================================================ */

router.post(
  "/",
  

  async (req, res) => {
    try {
      const { name } = req.body || {};

      if (!validName(name)) {
        return res.status(400).json({
          message: "A valid inspection name is required.",
        });
      }

      const cleanName = name.trim();
      const code = createCode(cleanName);

      if (
        !/^[a-z][a-z0-9_]*$/.test(code) ||
        code.length > 100
      ) {
        return res.status(400).json({
          message:
            "Inspection name cannot generate a valid code.",
        });
      }

      const existingName = await InspectionItem.findOne({
        name: {
          $regex:
            "^" +
            cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "$",
          $options: "i",
        },
      });

      if (existingName) {
        return res.status(409).json({
          message: "Inspection name already exists.",
        });
      }

      const lastItem = await InspectionItem.findOne({})
        .sort({ display_order: -1 })
        .lean();

      const item = await InspectionItem.create({
        code,
        name: cleanName,
        is_active: true,
        display_order:
          (lastItem?.display_order || 0) + 1,
      });

      return res.status(201).json({
        success: true,
        message: "Inspection item created.",
        inspection: item,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

/* ============================================================
   REORDER INSPECTION ITEMS - ADMIN
============================================================ */

router.patch(
  "/reorder",
  

  async (req, res) => {
    try {
      const { ordered_ids } = req.body || {};

      if (
        !Array.isArray(ordered_ids) ||
        ordered_ids.length === 0 ||
        !ordered_ids.every(
          (id) =>
            typeof id === "string" &&
            Types.ObjectId.isValid(id)
        )
      ) {
        return res.status(400).json({
          message: "Invalid inspection order.",
        });
      }

      const uniqueIds = new Set(ordered_ids);

      if (uniqueIds.size !== ordered_ids.length) {
        return res.status(400).json({
          message: "Duplicate inspection IDs are not allowed.",
        });
      }

      const existingItems =
        await InspectionItem.find({})
          .select("_id")
          .lean();

      const existingIds = new Set(
        existingItems.map((item) => String(item._id))
      );

      if (
        ordered_ids.length !== existingIds.size ||
        !ordered_ids.every((id) => existingIds.has(id))
      ) {
        return res.status(400).json({
          message:
            "Order must include every inspection item exactly once.",
        });
      }

      await InspectionItem.bulkWrite(
        ordered_ids.map((id, index) => ({
          updateOne: {
            filter: { _id: id },
            update: {
              $set: {
                display_order: index + 1,
              },
            },
          },
        }))
      );

      return res.status(200).json({
        success: true,
        message: "Inspection order updated.",
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

/* ============================================================
   EDIT INSPECTION ITEM - ADMIN
============================================================ */

router.put(
  "/:id",
  

  async (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body || {};

      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid inspection ID.",
        });
      }

      if (!validName(name)) {
        return res.status(400).json({
          message: "A valid inspection name is required.",
        });
      }

      const cleanName = name.trim();

      const duplicate = await InspectionItem.findOne({
        _id: { $ne: id },
        name: {
          $regex:
            "^" +
            cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "$",
          $options: "i",
        },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "Inspection name already exists.",
        });
      }

      const item = await InspectionItem.findByIdAndUpdate(
        id,
        {
          $set: {
            name: cleanName,
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!item) {
        return res.status(404).json({
          message: "Inspection item not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Inspection item updated.",
        inspection: item,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

/* ============================================================
   SHOW / HIDE INSPECTION ITEM - ADMIN
============================================================ */

router.patch(
  "/:id/visibility",
  

  async (req, res) => {
    try {
      const { id } = req.params;
      const { is_active } = req.body || {};

      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid inspection ID.",
        });
      }

      if (typeof is_active !== "boolean") {
        return res.status(400).json({
          message: "is_active must be Boolean.",
        });
      }

      const item = await InspectionItem.findByIdAndUpdate(
        id,
        {
          $set: { is_active },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!item) {
        return res.status(404).json({
          message: "Inspection item not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: is_active
          ? "Inspection item activated."
          : "Inspection item hidden.",
        inspection: item,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }
);

export default router;
