import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
const fallbackSecret = randomBytes(32).toString("hex");
function sign(value: string) {
  return createHmac("sha256", process.env.APPLICATION_FORM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || fallbackSecret).update(value).digest("hex");
}
export function createApplicationChallenge() {
  const a = randomInt(2, 20), b = randomInt(1, 10);
  const payload = `${Date.now() + 20 * 60 * 1000}.${randomBytes(12).toString("hex")}`;
  return { question: `${a} + ${b}`, token: `${payload}.${sign(`${payload}.${a + b}`)}` };
}
export function verifyApplicationChallenge(token: string, answer: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !/^\d{1,2}$/.test(answer) || !/^[a-f0-9]{64}$/.test(parts[2])) return false;
  const expiry = Number(parts[0]);
  if (!Number.isFinite(expiry) || expiry < Date.now() || expiry > Date.now() + 21 * 60 * 1000) return false;
  return timingSafeEqual(Buffer.from(parts[2], "hex"), Buffer.from(sign(`${parts[0]}.${parts[1]}.${Number(answer)}`), "hex"));
}
