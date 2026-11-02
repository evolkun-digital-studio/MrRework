import { Schema, model, models, type Model } from "mongoose";

// A saved column-mapping so a recurring exporter (e.g. the same WooCommerce
// store re-exported monthly) doesn't need its columns remapped by hand every
// time. Scoped by `importType` so presets from one importer never show up
// as options for another.
const ImportMappingPresetSchema = new Schema(
  {
    name: { type: String, required: true },
    importType: { type: String, required: true, index: true },
    mapping: { type: Schema.Types.Mixed, required: true },
    adminUser: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const ImportMappingPresetModel: Model<any> =
  models.ImportMappingPreset || model("ImportMappingPreset", ImportMappingPresetSchema);
