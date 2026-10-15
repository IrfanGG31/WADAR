/** Anonymous visitor session: random id in an httpOnly cookie, only sent to /api/widget. */
export const WIDGET_COOKIE = "wadar_wid";

export const WIDGET_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/api/widget",
  maxAge: 60 * 60 * 24 * 30,
} as const;
