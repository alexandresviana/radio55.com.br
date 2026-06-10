import { NextResponse } from "next/server";
import { readMunicipios } from "@/lib/emissoras";

export async function GET() {
  const municipios = await readMunicipios();
  return NextResponse.json(municipios);
}
