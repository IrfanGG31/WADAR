export interface PhotoStorageOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket?: string;
}

export interface SignedUpload {
  /** PUT the file body here (Content-Type = the image type) — no auth header needed. */
  uploadUrl: string;
  path: string;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Product photos in a PRIVATE Supabase Storage bucket, path-prefixed by
 * tenant (ARCHITECTURE §5.5). The browser never gets the service key: the
 * API hands out a one-shot signed upload URL for a path it chose, and
 * short-lived signed read URLs for display.
 */
export class PhotoStorage {
  private readonly bucket: string;
  private bucketReady: Promise<void> | undefined;

  constructor(private readonly options: PhotoStorageOptions) {
    this.bucket = options.bucket ?? "product-photos";
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.options.serviceRoleKey}`,
      apikey: this.options.serviceRoleKey,
      "content-type": "application/json",
    };
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const res = await fetch(`${this.options.supabaseUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false, file_size_limit: 5 * 1024 * 1024 }),
      });
      // 400/409 = already exists — fine.
      if (!res.ok && res.status !== 400 && res.status !== 409) {
        this.bucketReady = undefined;
        throw new Error(`storage: could not ensure bucket (${res.status})`);
      }
    })();
    return this.bucketReady;
  }

  async createSignedUpload(path: string): Promise<SignedUpload> {
    await this.ensureBucket();
    const res = await fetch(
      `${this.options.supabaseUrl}/storage/v1/object/upload/sign/${this.bucket}/${path}`,
      { method: "POST", headers: this.headers(), body: "{}" },
    );
    if (!res.ok) throw new Error(`storage: signed upload failed (${res.status})`);
    const json = (await res.json()) as { url: string };
    return { uploadUrl: `${this.options.supabaseUrl}/storage/v1${json.url}`, path };
  }

  async signedReadUrls(paths: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (paths.length === 0) return result;
    const res = await fetch(`${this.options.supabaseUrl}/storage/v1/object/sign/${this.bucket}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS, paths }),
    });
    if (!res.ok) return result; // photos are decoration — never fail a product list over them
    const json = (await res.json()) as Array<{ path: string; signedURL: string | null }>;
    for (const item of json) {
      if (item.signedURL) result.set(item.path, `${this.options.supabaseUrl}/storage/v1${item.signedURL}`);
    }
    return result;
  }
}
