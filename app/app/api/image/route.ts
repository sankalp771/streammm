import { NextRequest, NextResponse } from "next/server";

export async function POST(_req: NextRequest) {
  return NextResponse.json({ message: "Image gateway scaffolded - Phase P0" });
}