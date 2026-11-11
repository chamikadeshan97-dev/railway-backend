
import { Schema, model } from "mongoose";

const failuresSchema = new Schema(
  {
    main_type: {
      type: String,
      required: true,
      trim: true,
      default: "running condition",
    },

    failure: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    code: {
      type: String,
      unique: true,
      sparse: true,
      immutable: true,
      trim: true,
      lowercase: true,
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
    collection: "failures",
  }
);

failuresSchema.index({
  main_type: 1,
  is_active: 1,
  display_order: 1,
});

export default model("failures", failuresSchema);
