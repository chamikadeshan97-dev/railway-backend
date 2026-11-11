import { Schema, model } from "mongoose";

/* ============================================================
   ENGINEEASE - USER MODEL
============================================================ */

const userSchema = new Schema(
  {
    nic: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    comNum: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      validate: {
        validator(value) {
          return /^[DFA][A-Z0-9]+$/.test(value);
        },
        message: "Computer number must start with D, F or A.",
      },
    },

    role: {
      type: String,
      enum: ["admin", "driver", "foreman"],
      required: true,
      default: "driver",
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "driver", "foreman"],
      default: "driver",
      required: true,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    failedAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "users",
  },
);

/* ============================================================
   AUTOMATIC ROLE ASSIGNMENT
   D = DRIVER
   F = FOREMAN
============================================================ */

userSchema.pre("validate", function () {
  if (!this.comNum) return;

  const companyNumber = this.comNum.trim().toUpperCase();

  this.comNum = companyNumber;

  // Preserve authorized administrator roles.
  // Admin creation must be protected by backend authorization.
  if (this.role === "admin") return;

  if (companyNumber.startsWith("D")) {
    this.role = "driver";
  } else if (companyNumber.startsWith("F")) {
    this.role = "foreman";
  }
});

/* ============================================================
   INDEXES
============================================================ */

userSchema.index({
  role: 1,
  isVerified: 1,
});

export default model("User", userSchema);
