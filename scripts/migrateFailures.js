
import mongoose from "mongoose";
import dotenv from "dotenv";

import Failure from "../models/failures.js";

dotenv.config();

const predefinedCodes = {
  "Dead man": "dead_man",
  "Transmission Circuit Leak": "transmission_circuit_leak",
  "Vac.pressure": "vac_pressure",
  "Wipers": "wipers",
  "Engine RPM": "engine_rpm",
  "Head light": "head_light",
  "Dynamic Brake Operation": "dynamic_brake_operation",
  "Horn": "hom",
  "Battery Charging": "battery_charging",
  "Rad. fan": "rad_fan",
  "Auxiliary Couplings": "auxiliary_couplings",
  "Air Pressure": "air_pressure",
  "Other": "other",
};

const makeCode = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

async function migrateFailures() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const failures = await Failure.find().sort({
      _id: 1,
    });

    const codes = failures.map(
      (item) =>
        item.code ||
        predefinedCodes[item.failure] ||
        makeCode(item.failure)
    );

    if (
      codes.some((code) => !code) ||
      new Set(codes).size !== codes.length
    ) {
      throw new Error(
        "Missing or duplicate failure codes. Review existing data."
      );
    }

    for (let i = 0; i < failures.length; i++) {
      const item = failures[i];

      const updates = {};

      if (!item.code) {
        updates.code = codes[i];
      }

      if (item.is_active === undefined) {
        updates.is_active = true;
      }

      if (
        item.display_order === undefined ||
        item.display_order === null
      ) {
        updates.display_order = i + 1;
      }

      if (Object.keys(updates).length > 0) {
        await Failure.collection.updateOne(
          { _id: item._id },
          { $set: updates }
        );
      }
    }

    console.log(
      `Migration completed. ${failures.length} failures checked.`
    );
  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

migrateFailures();
