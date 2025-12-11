import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import jwt from "jsonwebtoken";

export const dynamic = 'force-dynamic';

export async function GET() {
  const envCheck = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: !!process.env.JWT_SECRET,
    JWT_SECRET_LENGTH: process.env.JWT_SECRET?.length || 0,
    NODE_ENV: process.env.NODE_ENV,
  };

  let dbStatus = "Unknown";
  let dbError = null;

  try {
    const { data, error } = await supabaseAdmin.from("users").select("count").limit(1).single();
    if (error) {
      dbStatus = "Error";
      dbError = error.message;
    } else {
      dbStatus = "Connected";
    }
  } catch (err: any) {
    dbStatus = "Crash";
    dbError = err.message;
  }

  // Test JWT verify with dummy token? No, just check if we CAN sign.
  let jwtStatus = "Unknown";
  try {
    const token = jwt.sign({ test: true }, process.env.JWT_SECRET || "wrong-secret");
    jwt.verify(token, process.env.JWT_SECRET || "wrong-secret");
    jwtStatus = "Working";
  } catch (err: any) {
    jwtStatus = "Error: " + err.message;
  }

  return NextResponse.json({
    env: envCheck,
    db: { status: dbStatus, error: dbError },
    jwt: { status: jwtStatus },
    timestamp: new Date().toISOString()
  });
}
