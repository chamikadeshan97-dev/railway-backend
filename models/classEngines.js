import { Schema, model } from 'mongoose';

const classEngineSchema = new Schema({
  type: { type: String, required: true, unique: true },
  class: { type: String, required: true },
  subClass:{ type: String, required: true },
   num:{ type: String, required: true },
   year:{ type: String, required: false },
   country:{ type: String, required: true },

   company:{ type: String, required: true },
   axleStructure:{ type: String, required: true },
   powerEngine:{ type: String, required: false },
   powerHp:{ type: Number, required: false },


}, { timestamps: true });

export default model('classengines', classEngineSchema);
