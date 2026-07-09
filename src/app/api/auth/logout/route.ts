import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, getSessionCookieOptions } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(getSessionCookieName(), "", {
    ...getSessionCookieOptions(request),
    maxAge: 0,
  });

  return response;
}
