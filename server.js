import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import engineRoutes from "./routes/engineRoutes.js";
import classEngineRoutes from "./routes/classEngineRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import failureRoutes from "./routes/failureRoutes.js";
import engineFailureRoutes from "./routes/engineFailures.js";
import tripCardRoutes from "./routes/tripCardRoutes.js";
import inspectionRoutes from "./routes/inspectionRoutes.js";
import engineInspectionsRouter from "./routes/engineInspections.js";
import inspectionItemRoutes from "./routes/inspectionItemRoutes.js";
/* ============================================================
   ENVIRONMENT VARIABLES
============================================================ */

dotenv.config();

/* ============================================================
   APP
============================================================ */

const app = express();

/* ============================================================
   MIDDLEWARE
============================================================ */

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

/* ============================================================
   TEST ROUTE
============================================================ */

app.get("/", (req, res) => {
  res.status(200).json({
    message: "Railway Backend API is running",
    database: mongoose.connection.name || "Not connected",
    databaseStatus:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

/* ============================================================
   ROUTES
============================================================ */

app.use("/api/engines", engineRoutes);

app.use("/api/classEngines", classEngineRoutes);

app.use("/api/user", userRoutes);

app.use("/api/failures", failureRoutes);

app.use("/api/engineFailures", engineFailureRoutes);

app.use("/api/tripCards", tripCardRoutes);

app.use("/api/inspections", inspectionRoutes);

app.use("/api/engine-inspections", engineInspectionsRouter);
app.use("/api/inspection-items", inspectionItemRoutes);
/* ============================================================
   DATABASE CONNECTION
============================================================ */

/* ============================================================
   DATABASE CONNECTION - ENV BASED
============================================================ */


const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    const databaseName =
      process.env.MONGO_DB_NAME || "railwayStaging";

    if (!mongoURI) {
      throw new Error(
        "MONGO_URI is missing from environment variables.",
      );
    }

    console.log("======================================");
    console.log("ENGINEEASE DATABASE CONFIGURATION");
    console.log("MongoDB URI loaded:", Boolean(mongoURI));
    console.log("Database name:", databaseName);
    console.log("Port:", process.env.PORT || 5000);
    console.log("======================================");

    await mongoose.connect(mongoURI, {
      dbName: databaseName,
      serverSelectionTimeoutMS: 10000,
    });

    console.log("======================================");
    console.log("MongoDB connected successfully");
    console.log("Database:", mongoose.connection.name);
    console.log("Host:", mongoose.connection.host);
    console.log("======================================");
  } catch (error) {
    console.error("======================================");
    console.error("ENGINEEASE DATABASE CONNECTION FAILED");
    console.error("Error name:", error.name);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("======================================");

    throw error;
  }
};


/* ============================================================
   SERVER
============================================================ */

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    /* CONNECT DATABASE FIRST */

    await connectDB();

    /* START SERVER */

    app.listen(PORT, () => {
      console.log("======================================");
      console.log("ENGINEEASE Backend API");
      console.log(`Server running on port ${PORT}`);
      console.log("Database: railwayStaging");
      console.log("======================================");
    });
  } catch (error) {
    console.error("Unable to start ENGINEEASE backend:", error.message);

    process.exit(1);
  }
};

startServer();
