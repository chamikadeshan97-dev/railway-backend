
import { Schema, model } from "mongoose";

const engineSchema = new Schema(
  {
    class: { type: String, required: true },
    subClass: { type: String, required: true, unique: true },
    num: { type: String, required: false },
    year: { type: String, required: false },
    country: { type: String, required: false },
    company: { type: String, required: false },
    axleStructure: { type: String, required: false },
    powerEngine: { type: String, required: false },
    powerHp: { type: String, required: false },
    specs: { type: String, required: false },

    condition: { type: String, required: true },
    shed: { type: String, required: true },
  },
  { timestamps: true }
);

export default model("Engine", engineSchema);
