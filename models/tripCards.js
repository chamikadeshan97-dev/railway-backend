
import { Schema, model } from "mongoose";

/* ============================================================
   ENGINEEASE - TRIP CARD MODEL
   DYNAMIC INSPECTION SUPPORT
============================================================ */

/* ============================================================
   DYNAMIC INSPECTION RESULTS
============================================================ */

const inspectionResultsSchema = {
  type: Map,
  of: Boolean,

  default: () => new Map(),

  validate: {
    validator: function (results) {
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
    },

    message:
      "All inspection results must contain valid component identifiers and Boolean values.",
  },
};

/* ============================================================
   TRIP CARD SCHEMA
============================================================ */

const tripCardSchema = new Schema(
  {
    /* ========================================================
       JOURNEY DETAILS
    ======================================================== */

    date: {
      type: Date,
      default: Date.now,
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
      uppercase: true,
    },

    driverName: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },

    assistanceComNum: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    assistanceName: {
      type: String,
      required: false,
      trim: true,
      default: "",
    },

    /* ========================================================
       LOCOMOTIVE
    ======================================================== */

    engine: {
      type: String,
      required: true,
      trim: true,
    },

    /* ========================================================
       DYNAMIC INSPECTION
    ======================================================== */

    isInspectionDone: {
      type: Boolean,
      default: false,
    },

    inspectionResults: {
      ...inspectionResultsSchema,
    },

    /* ========================================================
       DOUBLE SET
    ======================================================== */

    isDoubleSet: {
      type: Boolean,
      default: false,
    },

    doubleSetLink: {
      type: String,
      required: false,
      default: "",
      trim: true,
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

tripCardSchema.index({
  driverComNum: 1,
  createdAt: -1,
});

tripCardSchema.index({
  engine: 1,
  createdAt: -1,
});

tripCardSchema.index({
  trainNumber: 1,
  createdAt: -1,
});

/* ============================================================
   MODEL
============================================================ */

export default model("Trips", tripCardSchema);
