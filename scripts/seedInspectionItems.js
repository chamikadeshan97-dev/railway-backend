
import mongoose from "mongoose";
import dotenv from "dotenv";

import InspectionItem from "../models/inspectionItem.js";

dotenv.config();

/* ============================================================
   ENGINEEASE - INITIAL INSPECTION CONFIGURATION
   ONE-TIME LEGACY CHECKLIST MIGRATION
============================================================ */

const INITIAL_INSPECTIONS = [
  ["auxiliary_couplings", "Auxiliary Couplings"],
  ["transmission_circuit_leak", "Transmission Circuit Leak"],
  ["dead_man", "Dead Man System"],
  ["hom", "HOM"],
  ["battery_charging", "Battery Charging"],
  ["vac_pressure", "Vacuum Pressure"],
  ["dynamic_brake_operation", "Dynamic Brake Operation"],
  ["air_pressure", "Air Pressure"],
  ["engine_rpm", "Engine RPM"],
  ["head_light", "Head Light"],
  ["wipers", "Wipers"],
  ["rad_fan", "Radiator Fan"],
];

/* ============================================================
   SEED INSPECTION ITEMS
============================================================ */

const seedInspectionItems = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing.");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const databaseName = mongoose.connection.db.databaseName;

    /* SAFETY: STAGING DATABASE ONLY */

    if (databaseName !== "railwayStaging") {
      throw new Error(
        `Seeding blocked. Connected database: ${databaseName}`
      );
    }

    console.log(`Connected to ${databaseName}`);

    let created = 0;
    let existing = 0;

    for (let index = 0; index < INITIAL_INSPECTIONS.length; index++) {
      const [code, name] = INITIAL_INSPECTIONS[index];

      const result = await InspectionItem.updateOne(
        { code },
        {
          $setOnInsert: {
            code,
            name,
            is_active: true,
            display_order: index + 1,
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        created += 1;
        console.log(`Created: ${name}`);
      } else {
        existing += 1;
        console.log(`Already exists: ${name}`);
      }
    }

    console.log("--------------------------------");
    console.log("Inspection initialization complete");
    console.log(`Created: ${created}`);
    console.log(`Existing: ${existing}`);
    console.log("--------------------------------");

  } catch (error) {
    console.error("Inspection initialization failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seedInspectionItems();
