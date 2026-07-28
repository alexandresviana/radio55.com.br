import { NextRequest, NextResponse } from "next/server";
import { UF_PADRAO } from "@/lib/estados";
import { readMunicipios } from "@/lib/emissoras";

export async function GET(request: NextRequest) {
  const estado = request.nextUrl.searchParams.get("estado")?.trim().toUpperCase() || UF_PADRAO;
  const municipios = await readMunicipios(estado);
  return NextResponse.json(municipios);
}
