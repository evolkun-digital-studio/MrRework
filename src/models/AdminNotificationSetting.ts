import { Schema, model, models, type Model } from "mongoose";

// One row per (admin, notification type) — deliberately its own small
// collection rather than another embedded array on User (like
// NotificationSettingsSchema there, which is customer-only preferences):
// `type` is a free-form string, same convention as ActivityLog.type, so a
// future notification type (e.g. "order_placed") never needs a schema
// migration, just a new value written/read through this same model.
const AdminNotificationSettingSchema = new Schema(
  {
    adminUser: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true }, // e.g. "customer_registered" — see src/lib/adminNotifications.ts
    enabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// No row for a given (admin, type) pair means "disabled" (the default) —
// rows are only ever created when a Parent Admin explicitly turns a
// notification on, not proactively for every admin. This unique index is
// what an upsert-based write (see the PATCH route) relies on to update in
// place instead of accumulating duplicate rows for the same pair.
AdminNotificationSettingSchema.index({ adminUser: 1, type: 1 }, { unique: true });

export const AdminNotificationSettingModel: Model<any> =
  models.AdminNotificationSetting || model("AdminNotificationSetting", AdminNotificationSettingSchema);
