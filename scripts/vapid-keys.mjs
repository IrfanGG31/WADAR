// Prints a fresh VAPID key pair for web push (GAP #7). Put the values in Vercel env, never in git:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT=mailto:<owner email>
import { generateKeyPairSync } from "node:crypto";

const jwk = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log("VAPID_SUBJECT=mailto:ganti@contoh.id");
