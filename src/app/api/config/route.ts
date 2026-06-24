import { NextResponse } from "next/server";
import { getConfig } from "@/lib/settings";

// 공개 설정 (예약 화면에서 사용): 예약금·시간대·숨김테마
export async function GET() {
  const cfg = await getConfig();
  return NextResponse.json(cfg);
}
