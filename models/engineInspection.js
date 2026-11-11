
import { Schema, model } from "mongoose";

/* ============================================================
   ENGINEEASE - DYNAMIC ENGINE INSPECTION MODEL
============================================================ */

/* ============================================================
   INSPECTION RESULTS VALIDATION
============================================================ */

const isValidInspectionResults = (results) => {
  if (!results) {
    return false;
  }

  const entries =
    results instanceof Map
      ? Array.from(results.entries())
      : Object.entries(results);

  if (entries.length === 0) {
    return false;
  }

  return entries.every(
    ([field, value]) =>
      typeof field === "string" &&
      /^[a-zA-Z][a-zA-Z0-9_]*$/.test(field) &&
      typeof value === "boolean"
  );
};

/* ============================================================
   ENGINE INSPECTION SCHEMA
============================================================ */

const engineInspectionSchema = new Schema(
  {
    engine: {
      type: String,
      required: true,
      trim: true,
    },

    tripCardId: {
      type: Schema.Types.ObjectId,
      ref: "Trips",
      required: true,
      unique: true,
    },

    trainNumber: {
      type: String,
      required: true,
      trim: true,
    },

    driverComNum: {
      type: String,
      required: true,
      trim: true,
    },

    inspectedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    /* ========================================================
       DYNAMIC INSPECTION RESULTS
    ======================================================== */

    inspectionResults: {
      type: Map,
      of: Boolean,
      required: true,

      validate: {
        validator: isValidInspectionResults,

        message:
          "Inspection results must contain valid inspection fields with Boolean values.",
      },
    },

    /* ========================================================
       SPECIAL NOTICED ISSUES
    ======================================================== */

    specialNoticedIssues: {
      type: String,
      required: false,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,

    toJSON: {
      flattenMaps: true,
    },

    toObject: {
      flattenMaps: true,
    },
  }
);

/* ============================================================
   INDEXES
============================================================ */

engineInspectionSchema.index({
  engine: 1,
  inspectedAt: -1,
  _id: -1,
});

/* ============================================================
   MODEL
============================================================ */

export default model(
  "EngineInspection",
  engineInspectionSchema
);
