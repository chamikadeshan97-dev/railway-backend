
import { Schema, model } from "mongoose";

/* ============================================================
   ENGINEEASE - DYNAMIC INSPECTION ITEM MODEL
============================================================ */

const inspectionItemSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      lowercase: true,
      match: /^[a-z][a-z0-9_]*$/,
      maxlength: 100,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    display_order: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

/* ============================================================
   INDEXES
============================================================ */

inspectionItemSchema.index({
  is_active: 1,
  display_order: 1,
});

/* ============================================================
   MODEL
============================================================ */

export default model(
  "InspectionItem",
  inspectionItemSchema
);
