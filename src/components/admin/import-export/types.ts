// Client-safe shapes mirroring what the API actually returns — kept separate
// from src/lib/import-export/types.ts, which is server-only and includes
// function-valued fields (mapRow/validateRow/importRow) that never cross
// the network.

export interface RegistryTargetField {
  key: string;
  label: string;
  required?: boolean;
  description?: string;
  unsupported?: boolean;
}

export interface RegistryImporter {
  key: string;
  label: string;
  description: string;
  icon: string;
  status: "available" | "coming-soon";
  acceptedExtensions: string[];
  targetFields: RegistryTargetField[];
}

export type ImportJobStatus = "uploaded" | "mapped" | "validated" | "importing" | "completed" | "failed" | "cancelled";

export interface CsvPreviewClient {
  totalRows: number;
  columns: string[];
  rows: Record<string, string>[];
  warnings: string[];
  duplicateCount?: number;
}

export interface ValidationIssueClient {
  row: number;
  field?: string;
  message: string;
  level: "error" | "warning";
}

export interface ValidationResultClient {
  totalRows: number;
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
  missingRequiredColumns: string[];
  issues: ValidationIssueClient[];
  truncated: boolean;
}

export interface ImportProgressClient {
  currentRow: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  startedAt?: string;
  estimatedRemainingMs?: number;
  bytesRead?: number;
  bytesTotal?: number;
  rowsProcessed?: number;
  statementsParsed?: number;
  tablesFound?: string[];
  percentComplete?: number;
  currentPhase?: "uploaded" | "parsing" | "building-preview" | "checking-duplicates" | "completed" | "failed";
  error?: string;
}

export interface ImportReportClient {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  durationMs?: number;
  warnings: string[];
  errors: { row: number; message: string; identifier?: string; label?: string; reasonCode?: string }[];
  /** Grouped over the full failure set, not just `errors` (which is capped at 500). Absent on jobs run before this field existed. */
  errorSummary?: { reasonCode: string; message: string; count: number }[];
}

export interface ImportJobClient {
  _id: string;
  type: string;
  status: ImportJobStatus;
  fileName: string;
  fileSize: number;
  totalRows: number;
  detectedColumns: string[];
  columnMapping: Record<string, string>;
  duplicateStrategy: "update" | "skip";
  preview: CsvPreviewClient | null;
  validation: ValidationResultClient | null;
  progress: ImportProgressClient;
  report: ImportReportClient;
  adminUser?: { _id: string; email?: string; firstName?: string; lastName?: string } | string;
  createdAt: string;
  updatedAt: string;
}

export interface MappingPresetClient {
  _id: string;
  name: string;
  importType: string;
  mapping: Record<string, string>;
  createdAt: string;
}

// Mirrors AnalysisReport in src/lib/import-export/products/wooCsvAnalyzer.ts
// (a server-only module) — duplicated here rather than imported, matching
// this file's existing convention of maintaining client-safe shape mirrors.
export interface AnalysisIssueClient { row: number; sku: string; message: string; level: "error" | "warning" }
export interface AnalysisCategoryRow { name: string; count: number; existsInDb: boolean; nested: boolean }
export interface AnalysisAttributeRow { name: string; valueCount: number; sampleValues: string[]; supported: boolean; mappingExists: boolean }
export interface AnalysisColumnRow { name: string; detectedType: string; mappedField: string | null; classification: "supported" | "ignored" | "manual-mapping-needed"; note?: string }
export interface AnalysisRiskItem { severity: "critical" | "warning" | "info"; message: string; count: number }
export interface AnalysisSeoFieldStatus { detected: boolean; columns: string[]; rowsPopulated: number }

export interface AnalysisReportClient {
  fileName: string;
  totalRows: number;
  analyzedAt: string;
  general: {
    totalProducts: number; simpleProducts: number; variableProducts: number;
    draftProducts: number; publishedProducts: number; privateProducts: number;
    featuredProducts: number; virtualProducts: number; downloadableProducts: number;
  };
  quality: {
    missingName: number; missingSku: number; duplicateSku: number; duplicateSlug: number;
    missingPrice: number; invalidPrice: number; missingCategories: number; withoutImages: number;
    missingStock: number; missingAttributes: number; missingVariations: number;
    emptyDescriptions: number; invalidStatus: number;
    issues: AnalysisIssueClient[]; issuesTruncated: boolean;
  };
  categories: { found: number; existing: number; toCreate: number; nested: number; duplicateGroups: string[][]; list: AnalysisCategoryRow[] };
  attributes: AnalysisAttributeRow[];
  variations: {
    variableProducts: number; variationRows: number; productsMissingParentColumn: number;
    orphanVariations: number; invalidAttributeCombinations: number; duplicateVariations: number;
  };
  images: {
    featuredImageCount: number; galleryImageCount: number; totalImageReferences: number;
    distinctImageUrls: number; brokenUrlCount: number; duplicateUrlCount: number; altTagsSupported: boolean;
  };
  seo: {
    metaTitle: AnalysisSeoFieldStatus; metaDescription: AnalysisSeoFieldStatus; focusKeyword: AnalysisSeoFieldStatus;
    canonicalUrl: AnalysisSeoFieldStatus; openGraph: AnalysisSeoFieldStatus; schema: AnalysisSeoFieldStatus;
  };
  columns: AnalysisColumnRow[];
  unsupported: { field: string; reason: string }[];
  databaseImpact: {
    productsToCreate: number; productsToUpdate: number; productsToSkip: number;
    categoriesToCreate: number; collectionsToCreate: number; imagesReferenced: number;
    estimatedImportTimeMs: number;
  };
  risks: AnalysisRiskItem[];
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// Mirrors MigrationAssistantReport in
// src/lib/import-export/products/migrationAssistant.ts (server-only) — same
// duplicated-mirror convention as AnalysisReportClient above.
export type PluginStatusClient = "fully-supported" | "partially-supported" | "not-supported";
export interface PluginDetectionClient { name: string; status: PluginStatusClient; detected: boolean; matchedColumns: string[]; explanation: string }
export type ConfidenceClient = "high" | "medium" | "low";
export interface FieldMappingRowClient { column: string; mappedField: string | null; importStatus: "supported" | "ignored" | "manual-mapping-needed"; confidence: ConfidenceClient }
export interface DataQualityReportClient {
  duplicateSkus: number; duplicateSlugs: number; duplicateCategories: number;
  brokenImageUrls: number; missingImages: number; missingAltTags: string;
  missingPrice: number; invalidPrices: number; negativeStock: number;
  missingCategories: number; missingAttributes: number; orphanVariations: number;
  unknownProductTypes: number; unknownStatusValues: number;
}
export interface SeoReportFieldClient { label: string; detected: boolean; rowsPopulated: number; willImport: boolean; note: string }
export interface AttributeReportRowClient { name: string; values: string[]; valueCount: number; productsUsing: number; supported: boolean; requiresManualMapping: boolean }
export interface MigrationPhaseClient { phase: number; title: string; description: string; expectedCount: number; unit: string }
export type RiskLevelClient = "Low Risk" | "Medium Risk" | "High Risk";
export interface RiskAssessmentClient { level: RiskLevelClient; score: number; reasons: string[] }
export interface RecommendationClient { priority: "high" | "medium" | "low"; message: string }

export interface MigrationAssistantReportClient {
  fileName: string;
  analyzedAt: string;
  storeProfile: {
    wooCommerceVersion: { detected: boolean; value: string | null; note: string };
    exportDate: { detected: boolean; value: string; note: string };
    totalProducts: number; simpleProducts: number; variableProducts: number;
    categories: number; tags: number; brands: number; attributes: number; images: number;
    averageVariantsPerProduct: number;
    productsWithoutImages: number; productsWithoutCategories: number;
    productsWithoutSku: number; productsWithoutStock: number;
    draftProducts: number; publishedProducts: number;
  };
  plugins: PluginDetectionClient[];
  fieldMapping: FieldMappingRowClient[];
  dataQuality: DataQualityReportClient;
  seo: SeoReportFieldClient[];
  attributes: AttributeReportRowClient[];
  migrationPlan: MigrationPhaseClient[];
  risk: RiskAssessmentClient;
  recommendations: RecommendationClient[];
}

// Mirrors CustomerAnalysisReport in
// src/lib/import-export/customers/wooCustomerSqlAnalyzer.ts (server-only) —
// same duplicated-mirror convention as the product report types above.
export interface CustomerAnalysisIssueClient { row: number; email: string; message: string; level: "error" | "warning" }
export interface CustomerAnalysisReportClient {
  fileName: string;
  totalRows: number;
  analyzedAt: string;
  general: {
    totalCustomers: number; withEmail: number; withoutEmail: number;
    withBillingAddress: number; withShippingAddress: number; subscribedToNewsletter: number;
    roleDistribution: { role: string; count: number }[];
  };
  quality: {
    missingEmail: number; invalidEmail: number; duplicateEmailsInFile: number;
    missingName: number; unparseableRegisteredDate: number;
    issues: CustomerAnalysisIssueClient[]; issuesTruncated: boolean;
  };
  metaKeyCoverage: { key: string; userCount: number; imported: boolean }[];
  databaseImpact: { customersToCreate: number; customersToUpdate: number; protectedAccountsMatched: number };
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// Mirrors CustomerMigrationAssistantReport in
// src/lib/import-export/customers/wooCustomerMigrationAssistant.ts.
export interface MigrationEstimateClient { durationMs: number; peakMemoryBytes: number; writes: number }
export interface CustomerMigrationAssistantReportClient {
  analysis: CustomerAnalysisReportClient;
  risk: RiskAssessmentClient;
  recommendations: RecommendationClient[];
  plan: MigrationPhaseClient[];
  estimate: MigrationEstimateClient;
}

// Mirrors CustomerPreviewRow/CustomerPreviewResult in
// src/lib/import-export/customers/wooCustomerPreview.ts.
export interface CustomerPreviewAddressClient {
  firstName: string; lastName: string; company: string; phone: string;
  address: string; apartment: string; city: string; state: string; postalCode: string; country: string;
}
export interface CustomerPreviewSideClient {
  email: string; firstName: string; lastName: string; displayName: string;
  role: string; wooRole: string; registeredAt: string | null; newsletter: boolean;
  passwordNeedsReset: boolean; sourceSystem: string;
  billingAddress: CustomerPreviewAddressClient | null;
  shippingAddress: CustomerPreviewAddressClient | null;
}
export interface CustomerPreviewRowClient {
  row: number; email: string; isDuplicateInFile: boolean; existsInDb: boolean; isProtected: boolean;
  before: CustomerPreviewSideClient | null;
  after: CustomerPreviewSideClient;
  warnings: string[];
}
export interface CustomerPreviewResultClient {
  rows: CustomerPreviewRowClient[];
  totalRows: number;
  truncated: boolean;
}

// Mirrors OrderAnalysisReport in src/lib/import-export/orders/wooOrderSqlAnalyzer.ts.
export interface OrderAnalysisIssueClient { row: number; orderNumber: string; message: string; level: "error" | "warning" }
export interface OrderAnalysisReportClient {
  fileName: string;
  totalRows: number;
  analyzedAt: string;
  general: {
    totalOrders: number; totalLineItems: number; guestOrders: number; registeredCustomerOrders: number;
    dateRange: { earliest: string | null; latest: string | null };
    statusBreakdown: { status: string; fulfillmentStatus: string; paymentStatus: string; count: number }[];
    paymentBreakdown: { bucket: string; gatewayId: string; count: number }[];
    revenue: {
      grossRevenueAllOrders: number; recognizedPaidRevenue: number; averageOrderValue: number;
      dominantCurrency: string | null;
      currencyBreakdown: { currency: string; count: number; total: number }[];
    };
    timeline: { period: string; orders: number; revenue: number }[];
  };
  quality: {
    missingOrderNumber: number; duplicateOrderNumbersInFile: number; negativeOrInvalidTotals: number;
    missingBillingAddress: number; missingShippingAddress: number;
    unrecognizedStatus: number; unrecognizedPaymentMethod: number; currencyMismatch: number;
    issues: OrderAnalysisIssueClient[]; issuesTruncated: boolean;
  };
  unsupportedMetaKeys: { key: string; orderCount: number }[];
  databaseImpact: {
    ordersToCreate: number; ordersToUpdate: number; protectedOrdersMatched: number;
    matchedCustomers: number; missingCustomers: number;
    totalLineItems: number; matchedProductItems: number; missingVariationItems: number; missingProductItems: number;
    couponCodesUsed: number; couponCodesMatched: number;
  };
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// Mirrors OrderMigrationAssistantReport in
// src/lib/import-export/orders/wooOrderMigrationAssistant.ts.
export interface OrderMigrationAssistantReportClient {
  analysis: OrderAnalysisReportClient;
  risk: RiskAssessmentClient;
  recommendations: RecommendationClient[];
  plan: MigrationPhaseClient[];
  estimate: MigrationEstimateClient;
}

// Mirrors OrderPreviewRow/OrderPreviewResult in
// src/lib/import-export/orders/wooOrderPreview.ts.
export interface OrderPreviewAddressClient {
  firstName: string; lastName: string; company: string; phone: string;
  address: string; apartment: string; city: string; state: string; postalCode: string; country: string;
}
export interface OrderPreviewItemClient {
  name: string; sku: string | null; quantity: number; unitPrice: number; subtotal: number; total: number; tax: number;
  matched: boolean; matchMethod: string; attributes: Record<string, string>;
}
export interface OrderPreviewSideClient {
  orderNumber: string;
  wooStatus: string; fulfillmentStatus: string; paymentStatus: string;
  createdAt: string | null;
  email: string; isGuestOrder: boolean;
  currency: string; subtotal: number; shipping: number; tax: number; discount: number; total: number;
  paymentMethod: string; paymentGatewayId: string; transactionId: string;
  couponCodes: string[];
  billingAddress: OrderPreviewAddressClient | null;
  shippingAddress: OrderPreviewAddressClient | null;
  items: OrderPreviewItemClient[];
}
export interface OrderPreviewRowClient {
  row: number; orderNumber: string; isDuplicateInFile: boolean; existsInDb: boolean; isProtected: boolean;
  before: OrderPreviewSideClient | null;
  after: OrderPreviewSideClient;
  warnings: string[];
}
export interface OrderPreviewResultClient {
  rows: OrderPreviewRowClient[];
  totalRows: number;
  truncated: boolean;
}

// Mirrors ReviewAnalysisReport in src/lib/import-export/reviews/wooReviewSqlAnalyzer.ts.
export interface ReviewAnalysisIssueClient { row: number; sourceId: string; message: string; level: "error" | "warning" }
export interface ReviewAnalysisReportClient {
  fileName: string;
  totalRows: number;
  analyzedAt: string;
  general: {
    totalReviews: number; guestReviews: number; registeredCustomerReviews: number;
    ratingDistribution: { rating: number; count: number }[];
    approvalBreakdown: { wooStatus: string; status: string; count: number }[];
    verifiedPurchaseCount: number; withAdminReply: number;
    timeline: { period: string; count: number }[];
  };
  quality: {
    missingProductReference: number; invalidRatings: number; unratedProductComments: number; trashedComments: number;
    duplicateReviewIdsInFile: number; duplicateReviewerProductCombos: number;
    missingReviewText: number; spamComments: number; nonProductComments: number; brokenProductReferences: number; unrecognizedStatus: number;
    issues: ReviewAnalysisIssueClient[]; issuesTruncated: boolean;
  };
  unsupportedMetaKeys: { key: string; reviewCount: number }[];
  databaseImpact: {
    reviewsToCreate: number; reviewsToUpdate: number; protectedReviewsMatched: number;
    matchedCustomers: number; missingCustomers: number; matchedProducts: number; missingProducts: number;
  };
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// Mirrors ReviewMigrationAssistantReport in
// src/lib/import-export/reviews/wooReviewMigrationAssistant.ts.
export interface ReviewMigrationAssistantReportClient {
  analysis: ReviewAnalysisReportClient;
  risk: RiskAssessmentClient;
  recommendations: RecommendationClient[];
  plan: MigrationPhaseClient[];
  estimate: MigrationEstimateClient;
}

// Mirrors ReviewPreviewRow/ReviewPreviewResult in
// src/lib/import-export/reviews/wooReviewPreview.ts.
export interface ReviewPreviewSideClient {
  sourceId: string; productId: string | null; productMatchMethod: string;
  author: string; email: string; isGuestReview: boolean;
  rating: number; title: string; body: string;
  verified: boolean; verifiedSource: string;
  status: string; wooStatus: string;
  createdAt: string | null; editedAt: string | null;
  adminReply: string; adminReplyDate: string | null;
  helpfulYes: number | null; helpfulNo: number | null;
}
export interface ReviewPreviewRowClient {
  row: number; sourceId: string; isDuplicateInFile: boolean; existsInDb: boolean; isProtected: boolean;
  willImport: boolean;
  classification: "review" | "product-comment" | "spam" | "trash";
  before: ReviewPreviewSideClient | null;
  after: ReviewPreviewSideClient;
  warnings: string[];
}
export interface ReviewPreviewResultClient {
  rows: ReviewPreviewRowClient[];
  totalRows: number;
  truncated: boolean;
}

// Mirrors ContentAnalysisReport in
// src/lib/import-export/content/wooContentSqlAnalyzer.ts. Shared shape for
// both Blog Posts and Pages (postType distinguishes them).
export interface ContentAnalysisIssueClient { row: number; sourceId: string; message: string; level: "error" | "warning" }
export interface ContentAnalysisReportClient {
  fileName: string;
  totalRows: number;
  analyzedAt: string;
  postType: "post" | "page";
  general: {
    totalItems: number;
    statusBreakdown: { wooStatus: string; status: string; count: number }[];
    visibilityBreakdown: { visibility: string; count: number }[];
    withFeaturedImage: number; withCategories: number; withTags: number;
    withOpenGraph: number; withTwitterCard: number; withSchema: number; withFocusKeyword: number;
    seoSourceBreakdown: { source: string; count: number }[];
    timeline: { period: string; count: number }[];
  };
  quality: {
    missingFeaturedImages: number; brokenMediaReferences: number; duplicateSlugsInFile: number; duplicateRedirectUrls: number;
    unsupportedSeoFields: number; unsupportedPageBuilders: number; shortcodeUsage: number; gutenbergBlocks: number;
    brokenInternalLinks: number; missingMetadata: number; brokenTaxonomy: number; unrecognizedStatus: number;
    issues: ContentAnalysisIssueClient[]; issuesTruncated: boolean;
  };
  databaseImpact: {
    itemsToCreate: number; itemsToUpdate: number; protectedItemsMatched: number;
    matchedAuthors: number; missingAuthors: number; matchedFeaturedImages: number; redirectsToGenerate: number;
    redirectsByType: { type: string; count: number }[];
  };
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// Mirrors ContentMigrationAssistantReport in
// src/lib/import-export/content/wooContentMigrationAssistant.ts — the
// unified assistant, composing both Blog Posts and Pages from one file.
export interface ContentMigrationAssistantReportClient {
  fileName: string;
  analyzedAt: string;
  blog: ContentAnalysisReportClient;
  pages: ContentAnalysisReportClient;
  risk: RiskAssessmentClient;
  recommendations: RecommendationClient[];
  seoCoverage: {
    totalItems: number; withSeoTitle: number; withSeoDescription: number;
    withOpenGraph: number; withTwitterCard: number; withSchema: number; withFocusKeyword: number;
    bySource: { source: string; count: number }[];
  };
  redirectSummary: { totalRedirects: number; byType: { type: string; count: number }[]; duplicates: number };
  mediaSummary: { totalFeaturedImages: number; matched: number; broken: number; missing: number };
  contentSummary: { totalBlogPosts: number; totalPages: number; publishedBlogPosts: number; publishedPages: number; withCategories: number; withTags: number };
  plan: MigrationPhaseClient[];
  verificationPreview: { imported: number; updated: number; skipped: number; failed: number };
  estimate: MigrationEstimateClient;
  summary: { score: number; label: "Ready to Import" | "Needs Review" | "High Risk" };
}

// Mirrors ContentPreviewRow/ContentPreviewResult in
// src/lib/import-export/content/wooContentPreview.ts.
export interface ContentPreviewSideClient {
  sourceId: string; title: string; slug: string; status: string; wooStatus: string; visibility: string;
  author: string; categories: string[]; tags: string[];
  seoTitle: string; seoDescription: string; seoSource: string;
  featuredImage: string; featuredImageMatched: boolean; redirectCount: number;
  createdAt: string | null;
}
export interface ContentPreviewRowClient {
  row: number; sourceId: string; isDuplicateInFile: boolean; existsInDb: boolean; isProtected: boolean;
  before: ContentPreviewSideClient | null;
  after: ContentPreviewSideClient;
  warnings: string[];
}
export interface ContentPreviewResultClient {
  rows: ContentPreviewRowClient[];
  totalRows: number;
  truncated: boolean;
  postType: "post" | "page";
}
export interface UnifiedContentPreviewResultClient {
  blog: ContentPreviewResultClient;
  pages: ContentPreviewResultClient;
}

export interface WooMappedRowClient {
  name: string; slug: string; sku: string; description: string;
  regularPrice: string; salePrice: string; stock: string; stockStatus: string;
  type: string; status: string;
  categories: string[]; tags: string[]; images: string[]; colors: string[]; sizes: string[];
  parentSku: string; seoTitle: string; seoDescription: string;
}

export interface ProductPreviewClient {
  sku: string;
  found: boolean;
  raw: Record<string, string>;
  mapped: WooMappedRowClient;
  document: Record<string, unknown>;
  categoryActions: { name: string; action: "reuse" | "create" }[];
}

// Mirrors MigrationCheckpoint in src/models/MigrationCheckpoint.ts.
export interface MigrationCheckpointClient {
  _id: string;
  importJob: string;
  adminUser?: { _id: string; email?: string; firstName?: string; lastName?: string } | string;
  fileName: string;
  importType: string;
  configuration: { columnMapping: Record<string, string>; duplicateStrategy: "update" | "skip" };
  riskOverridden: boolean;
  status: "running" | "completed" | "failed";
  startedAt: string;
  preMigration: {
    expectedProducts: number; expectedCategoriesCreated: number; expectedVariations: number; expectedImages: number;
    riskLevel?: string; riskScore?: number;
    unsupportedFields?: { field: string; reason: string }[];
  };
  postMigration?: {
    actualProductsCreated: number; actualProductsUpdated: number; actualProductsSkipped: number; actualProductsDraft: number;
    actualCategoriesCreated: number; actualCategoriesReused: number;
    actualVariations: number; actualImages: number;
    createdProducts: { sku: string; productId: string }[];
    updatedProducts: { sku: string; productId: string }[];
    createdCategories: { name: string; categoryId: string }[];
    validation: { productCountMatch: boolean; categoryCountMatch: boolean; variationCountMatch: boolean; imageCountMatch: boolean; status: "successful" | "requires-attention" };
    warnings: string[];
    errors: { row: number; message: string }[];
    timeTakenMs: number;
    peakMemoryBytes?: number;
    rowsPerSecond?: number | null;
    readinessScore: number;
    finalizedAt: string;
  };
  createdAt: string;
}

// Mirrors the Media Migration Manager's server-only types
// (src/lib/media-migration/*) and MediaMigrationJob model.
export interface MediaSourceClient { key: string; label: string; description: string; status: "available" | "coming-soon" }

export interface MediaScanSummaryClient {
  totalReferences: number;
  distinctUrls: number;
  alreadyExisting: number;
  toDownload: number;
  perSource: { key: string; label: string; referenceCount: number }[];
}

export type MediaMigrationJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface MediaMigrationJobClient {
  _id: string;
  adminUser?: { _id: string; email?: string; firstName?: string; lastName?: string } | string;
  sources: string[];
  status: MediaMigrationJobStatus;
  startedAt?: string;
  cancelRequested: boolean;
  configuration: { maxConcurrency: number; maxFileSizeBytes: number };
  expected: { totalReferences: number; distinctUrls: number };
  progress: {
    processed: number; downloaded: number; reused: number; skipped: number; failed: number; duplicates: number;
    currentUrl: string; bytesDownloaded: number; estimatedRemainingMs?: number;
  };
  report: {
    downloaded: number; reused: number; duplicates: number; failed: number; brokenUrls: number; unsupportedFormats: number;
    totalBytes: number; avgDownloadSpeedBytesPerSec: number; durationMs?: number;
    errors: { url: string; message: string }[]; warnings: string[];
  };
  rollbackPrep: {
    downloadedMediaIds: { mediaId: string; url: string }[];
    updatedProductIds: string[];
    updatedCategoryIds: string[];
  };
  createdAt: string;
}
