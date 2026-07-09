const SESSION_COOKIE = "radio55_session";
const SESSION_VALUE = "authenticated";

export function getSessionCookieName() {
  return SESSION_COOKIE;
}

type CookieRequest = { headers: { get(name: string): string | null } };

/** Evita cookie Secure em HTTP (comum atrás de proxy sem TLS ou acesso direto por IP). */
export function shouldUseSecureCookies(request?: CookieRequest): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;

  const proto = request?.headers.get("x-forwarded-proto");
  if (proto) {
    return proto.split(",")[0]?.trim().toLowerCase() === "https";
  }

  return process.env.NODE_ENV === "production";
}

export function getSessionCookieOptions(request?: CookieRequest) {
  return {
    httpOnly: true,
    secure: shouldUseSecureCookies(request),
    sameSite: "lax" as const,
    path: "/",
  };
}

export function safeRedirectPath(from: string | null | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/";
  return from;
}

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(secret: string): Promise<string> {
  return hmacSha256(secret, SESSION_VALUE);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function isValidSessionToken(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const expected = await createSessionToken(secret);
  return safeEqual(token, expected);
}

export function validateCredentials(
  username: string,
  password: string,
  expectedUser: string,
  expectedPass: string,
): boolean {
  return safeEqual(username, expectedUser) && safeEqual(password, expectedPass);
}
