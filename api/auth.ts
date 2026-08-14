import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "apms_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function buildToken(secret: string): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload, secret)}`;
}

function verifyToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload, secret))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function cookieHeader(value: string, maxAgeSeconds: number): string {
  const secure = process.env.VERCEL ? " Secure;" : ""; // allow http on plain local dev
  return `${COOKIE_NAME}=${value}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, SESSION_SECRET } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !SESSION_SECRET) {
    res.status(500).json({ error: "Server not configured: missing admin env vars" });
    return;
  }

  if (req.method === "POST") {
    const { username, password } = req.body ?? {};
    const ok =
      typeof username === "string" &&
      typeof password === "string" &&
      safeEqual(username.trim(), ADMIN_USERNAME) &&
      safeEqual(password, ADMIN_PASSWORD);

    if (!ok) {
      res.status(401).json({ error: "Incorrect username or password" });
      return;
    }

    res.setHeader("Set-Cookie", cookieHeader(buildToken(SESSION_SECRET), SESSION_TTL_MS / 1000));
    res.status(200).json({ isAdmin: true });
    return;
  }

  if (req.method === "GET") {
    const token = readCookie(req.headers.cookie, COOKIE_NAME);
    res.status(200).json({ isAdmin: verifyToken(token, SESSION_SECRET) });
    return;
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", cookieHeader("", 0));
    res.status(200).json({ ok: true });
    return;
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}
