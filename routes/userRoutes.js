import { Router } from "express";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import User from "../models/users.js";

import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

/* ============================================================
   ENGINEEASE - USER MANAGEMENT
============================================================ */

/* ============================================================
   HELPERS
============================================================ */

const normalizeComNum = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const normalizeText = (value) =>
  typeof value === "string" ? value.trim() : "";

const getRoleFromComNum = (comNum) => {
  if (comNum.startsWith("D")) return "driver";
  if (comNum.startsWith("F")) return "foreman";
  return null;
};

const isValidPersonnelComNum = (comNum) => /^[DF][A-Z0-9]+$/.test(comNum);

const isValidAdminComNum = (comNum) => /^A[A-Z0-9]+$/.test(comNum);

const isStrongPassword = (password) =>
  typeof password === "string" &&
  password.length >= 12 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[0-9]/.test(password);

const safeUser = (user) => {
  if (!user) return null;

  const data =
    typeof user.toObject === "function" ? user.toObject() : { ...user };

  delete data.password;
  delete data.__v;

  return data;
};

const handleDatabaseError = (res, error) => {
  console.error("User management error:", error);

  if (error.code === 11000) {
    return res.status(409).json({
      message: "Computer number or NIC already exists.",
    });
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({
      message: "Invalid user information.",
    });
  }

  return res.status(500).json({
    message: "Internal server error.",
  });
};

/* ============================================================
   GET ALL USERS - ADMIN ONLY
============================================================ */

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json(users);
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

/* ============================================================
   LOGIN - DRIVER / FOREMAN / ADMIN
============================================================ */

router.post("/login", async (req, res) => {
  try {
    const comNum = normalizeComNum(req.body?.comNum);
    const { password } = req.body || {};

    /* --------------------------------------------------------
       VALIDATE REQUEST
    -------------------------------------------------------- */

    if (!comNum || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Company number and password are required.",
      });
    }

    /* --------------------------------------------------------
       FIND USER
    -------------------------------------------------------- */

    const user = await User.findOne({ comNum });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials UN.",
      });
    }

    /* --------------------------------------------------------
       UPDATE LOGIN ATTEMPTS
    -------------------------------------------------------- */

    await User.updateOne({ _id: user._id }, { $inc: { attempts: 1 } });

    /* --------------------------------------------------------
       VERIFY PASSWORD
    -------------------------------------------------------- */

    const isMatch = await bcryptjs.compare(password, user.password);

    if (!isMatch) {
      await User.updateOne({ _id: user._id }, { $inc: { failedAttempts: 1 } });

      return res.status(401).json({
        message: "Invalid credentials PW.",
      });
    }

    /* --------------------------------------------------------
       CHECK ACCOUNT STATUS
    -------------------------------------------------------- */

    if (user.isVerified !== true) {
      return res.status(403).json({
        message: "Your account is pending verification or disabled.",
      });
    }

    /* --------------------------------------------------------
       CHECK JWT SECRET
    -------------------------------------------------------- */

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing.");

      return res.status(500).json({
        message: "Authentication configuration error.",
      });
    }

    /* --------------------------------------------------------
       GENERATE TOKEN
       EXISTING JWT STRUCTURE PRESERVED
    -------------------------------------------------------- */

    const token = jwt.sign(
      {
        userId: user._id.toString(),
        username: user.comNum,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
        algorithm: "HS256",
      },
    );

    /* --------------------------------------------------------
       UPDATE LAST LOGIN
    -------------------------------------------------------- */

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          lastLogin: new Date(),
          failedAttempts: 0,
        },
      },
      { new: true, runValidators: true },
    ).select("-password");

    return res.status(200).json({
      message: "Login successful!",
      token,
      user: safeUser(updatedUser),
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

/* ============================================================
   REGISTER DRIVER / FOREMAN - ADMIN ONLY
============================================================ */

router.post("/register", requireAuth, requireAdmin, async (req, res) => {
  try {
    const comNum = normalizeComNum(req.body?.comNum);
    const name = normalizeText(req.body?.name);
    const nic = normalizeText(req.body?.nic);
    const { password } = req.body || {};

    /* --------------------------------------------------------
         VALIDATE FIELDS
      -------------------------------------------------------- */

    if (!comNum || !name || !nic || typeof password !== "string") {
      return res.status(400).json({
        message: "Company number, name, NIC and password are required.",
      });
    }

    if (!isValidPersonnelComNum(comNum)) {
      return res.status(400).json({
        message:
          "Driver computer numbers must start with D and Foreman computer numbers must start with F.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters.",
      });
    }

    /* --------------------------------------------------------
         DETERMINE ROLE
      -------------------------------------------------------- */

    const role = getRoleFromComNum(comNum);

    /* --------------------------------------------------------
         CHECK EXISTING ACCOUNT
      -------------------------------------------------------- */

    const existing = await User.findOne({
      $or: [{ comNum }, { nic }],
    });

    if (existing) {
      return res.status(409).json({
        message: "A user with this company number or NIC already exists.",
      });
    }

    /* --------------------------------------------------------
         HASH PASSWORD
      -------------------------------------------------------- */

    const hashedPassword = await bcryptjs.hash(password, 12);

    /* --------------------------------------------------------
         CREATE USER
      -------------------------------------------------------- */

    const newUser = await User.create({
      comNum,
      nic,
      name,
      password: hashedPassword,
      role,
      attempts: 0,
      failedAttempts: 0,
      lastLogin: null,
      isVerified: false,
    });

    return res.status(201).json({
      message: `${role === "driver" ? "Driver" : "Foreman"} registered successfully. Awaiting verification.`,
      user: safeUser(newUser),
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

/* ============================================================
   CREATE ADMINISTRATOR - ADMIN ONLY
============================================================ */

router.post("/admin/create", requireAuth, requireAdmin, async (req, res) => {
  try {
    const comNum = normalizeComNum(req.body?.comNum);
    const name = normalizeText(req.body?.name);
    const nic = normalizeText(req.body?.nic);
    const { password } = req.body || {};

    /* --------------------------------------------------------
         VALIDATION
      -------------------------------------------------------- */

    if (!name || !nic || !comNum) {
      return res.status(400).json({
        message: "Name, NIC and computer number are required.",
      });
    }

    if (!isValidAdminComNum(comNum)) {
      return res.status(400).json({
        message: "Administrator computer number must start with A.",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Admin password must have at least 12 characters, including uppercase, lowercase and numeric characters.",
      });
    }

    /* --------------------------------------------------------
         CHECK DUPLICATES
      -------------------------------------------------------- */

    const existing = await User.findOne({
      $or: [{ comNum }, { nic }],
    });

    if (existing) {
      return res.status(409).json({
        message: "Computer number or NIC already exists.",
      });
    }

    /* --------------------------------------------------------
         HASH PASSWORD
      -------------------------------------------------------- */

    const hashedPassword = await bcryptjs.hash(password, 12);

    /* --------------------------------------------------------
         CREATE ADMIN
      -------------------------------------------------------- */

    const admin = await User.create({
      name,
      nic,
      comNum,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      attempts: 0,
      failedAttempts: 0,
      lastLogin: null,
    });

    return res.status(201).json({
      message: "Administrator account created successfully.",
      user: safeUser(admin),
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

/* ============================================================
   GET USER BY COMPANY NUMBER
   EXISTING ENDPOINT PRESERVED
============================================================ */

router.get("/driverByDrivcerComNum", requireAuth, async (req, res) => {
  try {
    const comNum = normalizeComNum(req.query.comNum);

    if (!comNum) {
      return res.status(400).json({
        message: "Company number is required.",
      });
    }

    if (
      req.user.role !== "admin" &&
      normalizeComNum(req.user.comNum) !== comNum
    ) {
      return res.status(403).json({
        message: "Access denied.",
      });
    }

    const user = await User.findOne({
      comNum,
    }).select("-password");

    if (!user) {
      return res.status(200).json([]);
    }

    return res.status(200).json(safeUser(user));
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

/* ============================================================
   ADMIN - VERIFY / DISABLE USER
============================================================ */

router.patch(
  "/:id/verification",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isVerified } = req.body || {};

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          message: "Invalid user ID.",
        });
      }

      if (typeof isVerified !== "boolean") {
        return res.status(400).json({
          message: "isVerified must be true or false.",
        });
      }

      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      /* --------------------------------------------------------
         PREVENT SELF-DISABLE
      -------------------------------------------------------- */

      if (String(user._id) === String(req.user.id) && !isVerified) {
        return res.status(400).json({
          message: "You cannot disable your own account.",
        });
      }

      /* --------------------------------------------------------
         UPDATE STATUS
      -------------------------------------------------------- */

      user.isVerified = isVerified;

      await user.save();

      return res.status(200).json({
        message: isVerified
          ? "User verified successfully."
          : "User disabled successfully.",
        user: safeUser(user),
      });
    } catch (error) {
      return handleDatabaseError(res, error);
    }
  },
);

/* ============================================================
   PUBLIC MOBILE REGISTRATION - DRIVER / FOREMAN
   NO ADMIN AUTHENTICATION REQUIRED
============================================================ */

router.post("/register-request", async (req, res) => {
  try {
    const comNum = normalizeComNum(req.body?.comNum);
    const name = normalizeText(req.body?.name);
    const nic = normalizeText(req.body?.nic).toUpperCase();
    const { password } = req.body || {};

    /* ========================================================
       VALIDATE REQUIRED FIELDS
    ======================================================== */

    if (!comNum || !name || !nic || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Computer number, name, NIC and password are required.",
      });
    }

    /* ========================================================
       VALIDATE COMPUTER NUMBER
    ======================================================== */

    if (!isValidPersonnelComNum(comNum)) {
      return res.status(400).json({
        message:
          "Driver computer numbers must start with D and Foreman computer numbers must start with F.",
      });
    }

    /* ========================================================
       DETERMINE ACCOUNT ROLE
    ======================================================== */

    const role = getRoleFromComNum(comNum);

    if (!role || !["driver", "foreman"].includes(role)) {
      return res.status(400).json({
        message: "Invalid account role.",
      });
    }

    /* ========================================================
       VALIDATE PASSWORD
    ======================================================== */

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must contain at least 8 characters.",
      });
    }

    /* ========================================================
       CHECK EXISTING ACCOUNT
    ======================================================== */

    const existingUser = await User.findOne({
      $or: [{ comNum }, { nic }],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "A user with this computer number or NIC already exists.",
      });
    }

    /* ========================================================
       HASH PASSWORD
    ======================================================== */

    const hashedPassword = await bcryptjs.hash(password, 12);

    /* ========================================================
       CREATE PENDING ACCOUNT
    ======================================================== */

    const newUser = await User.create({
      name,
      nic,
      comNum,
      password: hashedPassword,

      role,

      isVerified: false,

      attempts: 0,
      failedAttempts: 0,
      lastLogin: null,
    });

    /* ========================================================
       RETURN REGISTRATION SUCCESS
    ======================================================== */

    return res.status(201).json({
      message:
        "Registration successful. Your account is pending administrator verification.",

      status: "pending",

      user: safeUser(newUser),
    });
  } catch (error) {
    return handleDatabaseError(res, error);
  }
});

export default router;
