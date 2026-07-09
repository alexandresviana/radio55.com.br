import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieName,
  getSessionCookieOptions,
  validateCredentials,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!username || !password || !secret) {
    return NextResponse.json(
      { error: "Credenciais não configuradas no servidor" },
      { status: 500 },
    );
  }

  const body = await request.json();
  const { user, pass } = body as { user?: string; pass?: string };

  if (!user || !pass || !validateCredentials(user, pass, username, password)) {
    return NextResponse.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  const token = await createSessionToken(secret);
  response.cookies.set(getSessionCookieName(), token, {
    ...getSessionCookieOptions(request),
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
