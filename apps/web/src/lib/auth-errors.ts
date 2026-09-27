interface AuthErrorLike {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Supabase Auth errors in plain Indonesian (PRD §4). The common production
 * failure is the email provider refusing to deliver (e.g. Resend still in
 * test mode only sends to the account owner) — Supabase surfaces that as a
 * 500 "Error sending … email", which means nothing to a shop owner.
 */
export function describeAuthError(error: AuthErrorLike): string {
  const code = error.code ?? "";
  const message = error.message.toLowerCase();
  if (error.status === 429 || code.startsWith("over_") || message.includes("rate limit")) {
    return "Terlalu sering minta kode. Tunggu beberapa menit, lalu coba lagi.";
  }
  if (code === "email_address_invalid" || message.includes("invalid format")) {
    return "Alamat email belum benar. Periksa lagi penulisannya.";
  }
  if (code.includes("sms") || code === "phone_provider_disabled" || message.includes("sms")) {
    return "Masuk lewat nomor HP belum tersedia. Pakai email, atau coba demo dulu.";
  }
  if (code === "otp_expired" || message.includes("expired") || message.includes("invalid")) {
    return "Kode salah atau sudah kedaluwarsa. Kirim ulang kode, lalu coba lagi.";
  }
  if ((error.status ?? 0) >= 500 || message.includes("sending")) {
    return "Kode masuk belum bisa dikirim ke email ini — layanan email kami sedang dibenahi. Sementara itu, kamu bisa langsung coba demo.";
  }
  return error.message;
}
