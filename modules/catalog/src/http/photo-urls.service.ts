import { Inject, Injectable, Optional } from "@nestjs/common";
import type { PhotoStorage } from "../infra/photo-storage.js";
import { CATALOG_PHOTO_STORAGE } from "./tokens.js";

/**
 * Turns stored photo paths into short-lived signed URLs. Exported so other
 * modules' read endpoints (e.g. inventory's stock list) can show product
 * photos without touching storage themselves.
 */
@Injectable()
export class CatalogPhotoUrls {
  constructor(@Optional() @Inject(CATALOG_PHOTO_STORAGE) private readonly storage?: PhotoStorage) {}

  get uploadEnabled(): boolean {
    return this.storage !== undefined;
  }

  async resolve<T extends { photoPath: string | null }>(items: T[]): Promise<Array<Omit<T, "photoPath"> & { photoUrl: string | null }>> {
    const paths = [...new Set(items.map((i) => i.photoPath).filter((p): p is string => p !== null))];
    const urls = this.storage ? await this.storage.signedReadUrls(paths) : new Map<string, string>();
    return items.map(({ photoPath, ...rest }) => ({ ...rest, photoUrl: photoPath ? (urls.get(photoPath) ?? null) : null }));
  }

  createSignedUpload(path: string) {
    if (!this.storage) throw new Error("photo storage disabled");
    return this.storage.createSignedUpload(path);
  }
}
