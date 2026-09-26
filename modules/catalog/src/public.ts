/**
 * Public API of the `catalog` module — the ONLY thing other modules may
 * import (CLAUDE.md aturan #1).
 */
export { CatalogModule, type CatalogModuleOptions } from "./catalog.module.js";
export {
  getCatalogQualitySummary,
  getVariantsForSale,
  loadCatalogProducts,
  type CatalogProduct,
  type CatalogQualitySummary,
  type VariantForSale,
} from "./application/queries.js";
export { CatalogPhotoUrls } from "./http/photo-urls.service.js";
