import { Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  AddVariantBody,
  CreateProductBody,
  ImportProductsBody,
  PhotoUploadBody,
  SetChannelPriceBody,
  UpdateProductBody,
  UpdateVariantBody,
  type ProductView,
} from "@wadar/contracts";
import { Permission, PermissionGuard, RequirePermission, SupabaseJwtGuard, TenantGuard } from "@wadar/identity";
import { IdempotencyKeyInterceptor, PLATFORM_DB, TenantScoped, ZodValidationPipe, problem, type Db } from "@wadar/platform";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CatalogError,
  addVariant,
  createProduct,
  importProducts,
  setChannelPrice,
  setProductPhoto,
  updateProduct,
  updateVariant,
  type CommandContext,
} from "../application/commands.js";
import { getProduct, listProducts, type CatalogProduct } from "../application/queries.js";
import { CatalogPhotoUrls } from "./photo-urls.service.js";

const PHOTO_EXTENSION: Record<PhotoUploadBody["contentType"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const SetPhotoBody = z.object({ path: z.string().min(10).max(300) });

/** HPP is internal: only roles that manage the catalog or see finance get it. */
export function canSeeCost(request: FastifyRequest): boolean {
  const permissions = request.tenant?.permissions ?? [];
  return permissions.includes(Permission.CatalogManage) || permissions.includes(Permission.FinanceView);
}

function toHttpError(error: unknown): never {
  if (error instanceof CatalogError) {
    const status = error.code.startsWith("DUPLICATE") ? 409 : 404;
    throw problem(status, error.code, error.message);
  }
  throw error;
}

@Controller("v1")
@UseGuards(SupabaseJwtGuard, TenantGuard, PermissionGuard)
export class ProductsController {
  constructor(
    @Inject(PLATFORM_DB) private readonly db: Db,
    @Inject(CatalogPhotoUrls) private readonly photos: CatalogPhotoUrls,
  ) {}

  private ctx(request: FastifyRequest, correlationId: string | undefined): CommandContext {
    return {
      tenantId: request.tenant!.tenantId,
      actorUserId: request.user!.id,
      correlationId: correlationId ?? randomUUID(),
    };
  }

  private withPhotoUrls(products: CatalogProduct[]): Promise<ProductView[]> {
    return this.photos.resolve(products);
  }

  @Get("products")
  @TenantScoped()
  async list(@Req() request: FastifyRequest, @Query("search") search?: string, @Query("archived") archived?: string) {
    const products = await listProducts(this.db, request.tenant!.tenantId, {
      search: search?.trim() || undefined,
      includeArchived: archived === "1",
      includeCost: canSeeCost(request),
    });
    return this.withPhotoUrls(products);
  }

  @Get("products/:id")
  @TenantScoped()
  async get(@Req() request: FastifyRequest, @Param("id", ParseUUIDPipe) id: string) {
    const product = await getProduct(this.db, request.tenant!.tenantId, id, canSeeCost(request));
    if (!product) throw problem(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");
    const [view] = await this.withPhotoUrls([product]);
    return view;
  }

  @Post("products")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async create(
    @Body(new ZodValidationPipe(CreateProductBody)) body: CreateProductBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return createProduct(this.db, this.ctx(request, correlationId), body).catch(toHttpError);
  }

  @Post("products/import")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async import(
    @Body(new ZodValidationPipe(ImportProductsBody)) body: ImportProductsBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return importProducts(this.db, this.ctx(request, correlationId), body).catch(toHttpError);
  }

  @Patch("products/:id")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateProductBody)) body: UpdateProductBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    await updateProduct(this.db, this.ctx(request, correlationId), id, body).catch(toHttpError);
    return { status: "ok" };
  }

  @Post("products/:id/variants")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  @UseInterceptors(IdempotencyKeyInterceptor)
  async addVariant(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(AddVariantBody)) body: AddVariantBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    return addVariant(this.db, this.ctx(request, correlationId), id, body).catch(toHttpError);
  }

  @Patch("variants/:id")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  async updateVariant(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateVariantBody)) body: UpdateVariantBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    await updateVariant(this.db, this.ctx(request, correlationId), id, body).catch(toHttpError);
    return { status: "ok" };
  }

  @Put("variants/:id/channel-prices")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  async setChannelPrice(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetChannelPriceBody)) body: SetChannelPriceBody,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    await setChannelPrice(this.db, this.ctx(request, correlationId), id, body).catch(toHttpError);
    return { status: "ok" };
  }

  @Post("products/:id/photo-upload")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  async photoUpload(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(PhotoUploadBody)) body: PhotoUploadBody,
    @Req() request: FastifyRequest,
  ) {
    if (!this.photos.uploadEnabled) {
      throw problem(422, "PHOTO_STORAGE_DISABLED", "Upload foto belum diaktifkan di server ini.");
    }
    const path = `${request.tenant!.tenantId}/products/${id}/${randomUUID()}.${PHOTO_EXTENSION[body.contentType]}`;
    return this.photos.createSignedUpload(path);
  }

  @Patch("products/:id/photo")
  @TenantScoped()
  @RequirePermission(Permission.CatalogManage)
  async setPhoto(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(SetPhotoBody)) body: z.infer<typeof SetPhotoBody>,
    @Req() request: FastifyRequest,
    @Headers("x-correlation-id") correlationId?: string,
  ) {
    // Only accept a path this API itself would have issued for this product.
    if (!body.path.startsWith(`${request.tenant!.tenantId}/products/${id}/`)) {
      throw problem(400, "INVALID_PHOTO_PATH", "Lokasi foto tidak valid.");
    }
    await setProductPhoto(this.db, this.ctx(request, correlationId), id, body.path).catch(toHttpError);
    return { status: "ok" };
  }
}
