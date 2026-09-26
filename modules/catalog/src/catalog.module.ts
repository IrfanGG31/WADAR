import { Module, type DynamicModule } from "@nestjs/common";
import { registerWriteIsolationCase, type Tx } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { CatalogPhotoUrls } from "./http/photo-urls.service.js";
import { ProductsController } from "./http/products.controller.js";
import { CATALOG_PHOTO_STORAGE } from "./http/tokens.js";
import { insertProduct, insertVariants } from "./infra/catalog.repository.js";
import { PhotoStorage, type PhotoStorageOptions } from "./infra/photo-storage.js";

export interface CatalogModuleOptions {
  /** Omit to disable photo upload (e.g. local dev without Supabase). */
  photoStorage?: PhotoStorageOptions;
}

let isolationCasesRegistered = false;

function registerCatalogWriteIsolationCases(): void {
  if (isolationCasesRegistered) return;
  isolationCasesRegistered = true;
  const fixture = async (tx: Tx, tenantAId: string) => {
    const productId = uuidv7();
    const variantId = uuidv7();
    await insertProduct(tx, { id: productId, tenantId: tenantAId, name: "Rahasia Tenant A", createdBy: "fixture" });
    await insertVariants(tx, [{ id: variantId, tenantId: tenantAId, productId, name: "", price: 1000 }]);
    return { productId, variantId };
  };
  registerWriteIsolationCase({
    module: "catalog",
    method: "PATCH",
    path: (id) => `/v1/products/${id}`,
    body: { name: "Dibajak" },
    createFixture: async (tx, tenantAId) => ({ id: (await fixture(tx, tenantAId)).productId }),
  });
  registerWriteIsolationCase({
    module: "catalog",
    method: "PATCH",
    path: (id) => `/v1/variants/${id}`,
    body: { price: 1 },
    createFixture: async (tx, tenantAId) => ({ id: (await fixture(tx, tenantAId)).variantId }),
  });
  registerWriteIsolationCase({
    module: "catalog",
    method: "POST",
    path: (id) => `/v1/products/${id}/variants`,
    body: { name: "X", price: 1, outletId: "00000000-0000-7000-8000-000000000000" },
    createFixture: async (tx, tenantAId) => ({ id: (await fixture(tx, tenantAId)).productId }),
  });
}

@Module({})
export class CatalogModule {
  static forRoot(options: CatalogModuleOptions = {}): DynamicModule {
    registerCatalogWriteIsolationCases();
    return {
      module: CatalogModule,
      global: true,
      controllers: [ProductsController],
      providers: [
        ...(options.photoStorage
          ? [{ provide: CATALOG_PHOTO_STORAGE, useValue: new PhotoStorage(options.photoStorage) }]
          : []),
        CatalogPhotoUrls,
      ],
      exports: [CatalogPhotoUrls],
    };
  }
}
