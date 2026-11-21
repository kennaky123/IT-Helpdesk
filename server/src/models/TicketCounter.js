import { Schema, createModel } from "../config/database.js";

const ticketCounterSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: "ticket_counters",
  },
);

const TicketCounter = createModel("TicketCounter", ticketCounterSchema);

export default TicketCounter;
