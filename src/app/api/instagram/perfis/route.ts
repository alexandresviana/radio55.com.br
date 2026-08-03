import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db";
import { criarInstagramPerfil, listarInstagramPerfis } from "@/lib/instagram-db";
import { extrairUsernameInstagram } from "@/lib/instagram-fetch";
import { syncInstagramPerfisAgora } from "@/lib/instagram-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor", perfis: [] }, { status: 503 });
  }

  const perfis = await listarInstagramPerfis();
  return NextResponse.json({ perfis });
}

export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Banco de dados não configurado no servidor" }, { status: 503 });
  }

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const entrada = body.url?.trim();
  if (!entrada) {
    return NextResponse.json({ error: "Informe o @usuário ou a URL do perfil" }, { status: 400 });
  }

  const username = extrairUsernameInstagram(entrada);
  if (!username) {
    return NextResponse.json(
      { error: "Perfil inválido. Use @usuario ou https://www.instagram.com/usuario" },
      { status: 400 },
    );
  }

  try {
    const perfil = await criarInstagramPerfil({
      username,
      titulo: `@${username}`,
      urlEntrada: entrada,
    });

    void syncInstagramPerfisAgora();

    return NextResponse.json({ perfil }, { status: 201 });
  } catch (error) {
    const pgCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (pgCode === "23505") {
      return NextResponse.json({ error: "Este perfil já está cadastrado" }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Erro ao cadastrar perfil";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
