import { Schema, createModel } from "../config/database.js";
import {
  USB_DEVICE_STATUSES,
  USB_DEVICE_TYPES,
  USB_EVENT_TYPES,
} from "../constants/usb.js";

const usbEventLogSchema = new Schema(
  {
    usbDevice: {
      type: Schema.Types.ObjectId,
      ref: "UsbDevice",
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    vendor: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Unknown Vendor",
    },
    serialNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    deviceType: {
      type: String,
      enum: USB_DEVICE_TYPES,
      default: "storage",
    },
    driveLetter: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    volumeName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    eventType: {
      type: String,
      enum: USB_EVENT_TYPES,
      required: true,
    },
    deviceStatusAtEvent: {
      type: String,
      enum: USB_DEVICE_STATUSES,
      default: "unverified",
    },
    hostname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    osUsername: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 80,
      default: null,
    },
    agentVersion: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "1.0.0-win64",
    },
  },
  {
    timestamps: true,
  },
);

usbEventLogSchema.index({ createdAt: -1 });
usbEventLogSchema.index({ hostname: 1, createdAt: -1 });

export const UsbEventLog = createModel("UsbEventLog", usbEventLogSchema, "usb_event_logs");
export default UsbEventLog;

