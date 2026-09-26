import { ApiError } from "./api-client";

/** User-facing message for any thrown value (API detail is already Bahasa Indonesia). */
export function errorMessage(error: unknown, fallback = "Terjadi kesalahan. Coba lagi."): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title ?? fallback;
  if (error instanceof TypeError) return "Tidak bisa terhubung ke server. Cek koneksi internet.";
  return fallback;
}
