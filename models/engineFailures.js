
import { Schema, model } from "mongoose";

/* ============================================================
   ENGINEEASE — ENGINE FAILURES MODEL
   MANUAL + AUTOMATIC TRIP CARD INSPECTION FAILURES
============================================================ */

const engineFailuresSchema = new Schema(
  {
    /* ========================================================
       FAILURE INFORMATION
    ======================================================== */

    date: {
      type: Date,
      required: false,
    },

    maintenanceNotes: {
      type: String,
      default: "",
      trim: true,
    },

    failure: {
      type: String,
      required: true,
      trim: true,
    },

    // Existing spelling preserved for backward compatibility.
    drivcerComNum: {
      type: String,
      required: true,
      trim: true,
    },

    driverName: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },

    engine: {
      type: String,
      required: true,
      trim: true,
    },

    trainNumber: {
      type: String,
      required: true,
      trim: true,
    },

    /* ========================================================
       TRIP CARD REFERENCE
    ======================================================== */

    tripCardId: {
      type: Schema.Types.ObjectId,
      ref: "Trips",
      required: false,
      default: null,
    },

    /* ========================================================
       FAILURE SOURCE
    ======================================================== */

    failureSource: {
      type: String,
      enum: [
        "Manual",
        "TripCardInspection",
      ],
      default: "Manual",
      required: true,
    },

    /* ========================================================
       INSPECTION ITEM REFERENCE

       Used when a failure is automatically generated
       from a Trip Card inspection item marked FALSE.
    ======================================================== */

    inspectionItemCode: {
      type: String,
      trim: true,
      default: null,
    },

    /* ========================================================
       FAILURE DETAILS
    ======================================================== */

    // Stores the driver's inspection comment or manual
    // failure description.
    comments: {
      type: String,
      required: false,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    status: {
      type: String,
      required: false,
      default: "Pending",
      trim: true,
    },

    /* ========================================================
       FOREMAN ASSIGNMENT
    ======================================================== */

    assignedForeman: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    assignedForemanComNum: {
      type: String,
      trim: true,
      default: "",
    },

    assignedForemanName: {
      type: String,
      trim: true,
      default: "",
    },

    foremanAssignedAt: {
      type: Date,
      default: null,
    },

    foremanAssignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    /* ========================================================
       FOREMAN ASSIGNMENT HISTORY
    ======================================================== */

    foremanAssignmentHistory: [
      {
        foreman: {
          type: Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        foremanComNum: {
          type: String,
          required: true,
        },

        foremanName: {
          type: String,
          default: "",
        },

        assignedBy: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },

        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    /* ========================================================
       MAINTENANCE INFORMATION
    ======================================================== */

    LFCComNum: {
      type: String,
      required: false,
    },

    // Existing Locomotive Fitter assignment.
    // Preserved for backward compatibility.
    assingedTo: {
      type: String,
      required: false,
    },

    startedOn: {
      type: Date,
      required: false,
    },

    completedOn: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

/* ============================================================
   INDEXES
============================================================ */

/* ============================================================
   TRIP CARD FAILURE LOOKUP
============================================================ */

engineFailuresSchema.index({
  tripCardId: 1,
  date: -1,
});

/* ============================================================
   LOCOMOTIVE FAILURE HISTORY
============================================================ */

engineFailuresSchema.index({
  engine: 1,
  date: -1,
});

/* ============================================================
   FOREMAN ASSIGNED FAILURES
============================================================ */

engineFailuresSchema.index({
  assignedForeman: 1,
  status: 1,
  date: -1,
});

/* ============================================================
   FAILURE SOURCE LOOKUP
============================================================ */

engineFailuresSchema.index({
  failureSource: 1,
  createdAt: -1,
});

/* ============================================================
   PREVENT DUPLICATE AUTOMATIC INSPECTION FAILURES

   One automatic failure per inspection item per Trip Card.

   Manual failures are not affected.
============================================================ */

engineFailuresSchema.index(
  {
    tripCardId: 1,
    inspectionItemCode: 1,
  },
  {
    unique: true,

    partialFilterExpression: {
      failureSource: "TripCardInspection",
      tripCardId: { $type: "objectId" },
      inspectionItemCode: { $type: "string" },
    },
  }
);

/* ============================================================
   EXPORT MODEL
============================================================ */

export default model(
  "engineFailures",
  engineFailuresSchema
);
