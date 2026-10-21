import { NextResponse } from "next/server";
import { getSqlite } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Healthcheck: confirma que o processo responde e que o banco SQLite está acessível. */
export function GET() {
  try {
    getSqlite().prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
