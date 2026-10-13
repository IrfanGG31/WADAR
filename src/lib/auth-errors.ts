interface AuthErrorLike {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Supabase Auth errors in plain Indonesian. The common production failure is
 * the email provider refusing to deliver (Resend in test mode only sends to
 * the account owner), which Supabase surfaces as a 500 "Error sending … email".
 */
export function describeAuthError(error: AuthErrorLike): string {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();
  if (error.status === 429 || code.startsWith("over_") || message.includes("rate limit")) {
    return "Terlalu sering minta kode. Tunggu beberapa menit, lalu coba lagi.";
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Email atau kata sandi salah.";
  }
  if (code === "email_not_confirmed") {
    return "Email ini belum dikonfirmasi. Masuk sekali lewat kode email dulu.";
  }
  if (code === "weak_password") {
    return "Kata sandi terlalu lemah. Pakai minimal 8 karakter, campur huruf dan angka.";
  }
  if (code === "same_password") {
    return "Kata sandi baru tidak boleh sama dengan yang lama.";
  }
  if (code === "email_address_invalid" || message.includes("invalid format")) {
    return "Alamat email belum benar. Periksa lagi penulisannya.";
  }
  if (code === "otp_expired" || message.includes("expired") || message.includes("invalid")) {
    return "Kode salah atau sudah kedaluwarsa. Kirim ulang kode, lalu coba lagi.";
  }
  if ((error.status ?? 0) >= 500 || message.includes("sending")) {
    return "Kode masuk belum bisa dikirim ke email ini — layanan email sedang dibenahi. Coba masuk dengan email & kata sandi.";
  }
  return error.message;
}
