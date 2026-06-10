const SESSION_COOKIE = "radio55_session";
const SESSION_VALUE = "authenticated";

export function getSessionCookieName() {
  return SESSION_COOKIE;
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
