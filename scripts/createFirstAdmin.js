
import "dotenv/config";

import mongoose from "mongoose";
import bcryptjs from "bcryptjs";
import crypto from "node:crypto";

import User from "../models/users.js";

/* ============================================================
   ENGINEEASE - FIRST ADMIN CREATION
============================================================ */

const createFirstAdmin = async () => {
  try {
    /* ========================================================
       CONNECT DATABASE
    ======================================================== */

    const mongoURI =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error(
        "MongoDB connection string is missing."
      );
    }

    await mongoose.connect(mongoURI);

    console.log("MongoDB connected successfully.");

    /* ========================================================
       CHECK EXISTING ADMIN
    ======================================================== */

    const existingAdmin = await User.findOne({
      role: "admin",
    });

    if (existingAdmin) {
      console.log(
        "An administrator already exists."
      );

      return;
    }

    /* ========================================================
       READ ADMIN DETAILS FROM ENVIRONMENT
    ======================================================== */

/* ========================================================
   ADMIN DETAILS
======================================================== */

const name = "EngineEase Administrator";

const nic = "YOUR_NIC_NUMBER";

const comNum = "A0001";

    if (
      !name ||
      !nic ||
      !/^A[A-Z0-9]+$/.test(comNum)
    ) {
      throw new Error(
        "Valid FIRST_ADMIN_NAME, FIRST_ADMIN_NIC and FIRST_ADMIN_COMNUM are required."
      );
    }

    /* ========================================================
       CHECK EXISTING COMPANY NUMBER / NIC
    ======================================================== */

    const existingUser = await User.findOne({
      $or: [
        { comNum },
        { nic },
      ],
    });

    if (existingUser) {
      throw new Error(
        "Company number or NIC already exists."
      );
    }

    /* ========================================================
       GENERATE SECURE TEMPORARY PASSWORD
    ======================================================== */

    const temporaryPassword = "Admin"

    const hashedPassword = await bcryptjs.hash(
      temporaryPassword,
      12
    );

    /* ========================================================
       CREATE FIRST ADMIN
    ======================================================== */

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

    /* ========================================================
       SUCCESS
    ======================================================== */

    console.log("\n================================");
    console.log("ENGINEEASE - FIRST ADMIN CREATED");
    console.log("================================");

    console.log("Name:", admin.name);
    console.log("Computer Number:", admin.comNum);
    console.log("Role:", admin.role);
    console.log("Status: Verified");

    console.log(
      "\nTemporary Password:",
      temporaryPassword
    );

    console.log(
      "\nStore this password securely and change it before operational use."
    );

    console.log("================================\n");
  } catch (error) {
    console.error(
      "First administrator creation failed:",
      error.message
    );

    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

createFirstAdmin();
