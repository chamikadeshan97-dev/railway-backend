import { Schema, model } from "mongoose";

const inspectionSchema = new Schema(
  {
    date: { type: Date, required: false },
    lfName: { type: String, required: false },
    lfComNum: { type: String, required: true },
    engine: { type: String, required: true },
    auxiliary_couplings: { type: Boolean, default: false },
    transmission_circuit_leak: { type: Boolean, default: false },
    dead_man: { type: Boolean, default: false },
    hom: { type: Boolean, default: false }, //
    battery_charging: { type: Boolean, default: false },
    vac_pressure: { type: Boolean, default: false },
    dynamic_brake_operation: { type: Boolean, default: false },
    air_pressure: { type: Boolean, default: false },
    engine_rpm: { type: Boolean, default: false },
    head_light: { type: Boolean, default: false },
    wipers: { type: Boolean, default: false },
    rad_fan: { type: Boolean, default: false }, //

    isDoubleSet: { type: Boolean, default: false }, //

    doubleSetLink: { type: String, required: false, default: "" },
    falseCount: { type: String, required: false, default: "0" },
    trueCount: { type: String, required: false, default: "12" },


    message: { type: String, required: false },

  },
  { timestamps: true }
);

export default model("inspection", inspectionSchema);
