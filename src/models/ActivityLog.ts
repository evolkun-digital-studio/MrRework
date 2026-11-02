import { Schema, model, models, type Model } from "mongoose";

// One log, three uses: the dashboard's "Recent activity" feed, the
// Inventory section's stock-adjustment history, and a general audit trail
// for sensitive admin actions — all just different `type`/`targetType`
// values on the same append-only collection, rather than three separate
// models duplicating the same shape.
const ActivityLogSchema = new Schema(
  {
    type: { type: String, required: true, index: true }, // e.g. "inventory_adjustment", "product_delete", "order_status_change", "settings_update"
    adminUser: { type: Schema.Types.ObjectId, ref: "User" },
    targetType: { type: String, default: "" }, // e.g. "Product", "Order", "Coupon"
    targetId: { type: String, default: "" },
    message: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

ActivityLogSchema.index({ createdAt: -1 });

export const ActivityLogModel: Model<any> = models.ActivityLog || model("ActivityLog", ActivityLogSchema);
