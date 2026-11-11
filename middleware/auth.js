
import jwt from "jsonwebtoken";

import User from "../models/users.js";

/* ============================================================
   ENGINEEASE - AUTHENTICATION MIDDLEWARE
============================================================ */

/* ============================================================
   REQUIRE AUTHENTICATION
============================================================ */

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    /* --------------------------------------------------------
       CHECK AUTHORIZATION HEADER
    -------------------------------------------------------- */

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is required.",
      });
    }

    const [scheme, token] = authHeader.split(" ");

    if (
      scheme?.toLowerCase() !== "bearer" ||
      !token
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization format.",
      });
    }

    /* --------------------------------------------------------
       CHECK JWT CONFIGURATION
    -------------------------------------------------------- */

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Authentication configuration error.",
      });
    }

    /* --------------------------------------------------------
       VERIFY JWT TOKEN
    -------------------------------------------------------- */

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      {
        algorithms: ["HS256"],
      }
    );

    if (
      !decoded ||
      typeof decoded !== "object" ||
      !decoded.userId
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    /* --------------------------------------------------------
       FIND CURRENT USER
    -------------------------------------------------------- */

    const user = await User.findById(
      decoded.userId
    ).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account no longer exists.",
      });
    }

    /* --------------------------------------------------------
       CHECK ACCOUNT STATUS
    -------------------------------------------------------- */

    if (user.isVerified !== true) {
      return res.status(403).json({
        success: false,
        message: "User account is not verified.",
      });
    }

    /* --------------------------------------------------------
       ATTACH USER TO REQUEST
    -------------------------------------------------------- */

    req.user = {
      id: user._id.toString(),
      userId: user._id.toString(),
      comNum: user.comNum,
      name: user.name,
      role: user.role || "driver",
      isVerified: user.isVerified,
    };

    return next();
  } catch (error) {
    /* --------------------------------------------------------
       HANDLE TOKEN ERRORS
    -------------------------------------------------------- */

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Session expired. Please log in again.",
      });
    }

    if (
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError" ||
      error.name === "CastError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    console.error("Authentication middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed.",
    });
  }
};

/* ============================================================
   REQUIRE ADMIN ROLE
============================================================ */

export const requireAdmin = (req, res, next) => {  
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const role = String(req.user.role || "")
    .trim()
    .toLowerCase();

  if (role !== "admin") {
    return res.status(403).json({
      success: false,
      message:
        "Access denied. Administrator privileges required.",
    });
  }

  return next();
};

/* ============================================================
   REQUIRE SPECIFIC ROLES
============================================================ */

export const requireRoles = (...allowedRoles) => {
  const normalizedRoles = allowedRoles.map(
    (role) =>
      String(role).trim().toLowerCase()
  );

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const userRole = String(req.user.role || "")
      .trim()
      .toLowerCase();

    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action.",
      });
    }

    return next();
  };
};

/* ============================================================
   OPTIONAL AUTHENTICATION
============================================================ */

export const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.user = null;
    return next();
  }

  return requireAuth(req, res, next);
};
