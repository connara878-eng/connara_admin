// app/api/admin/me/route.ts
// 서버에서 "이 요청자가 관리자냐"를 판단
// - Authorization: Bearer <Firebase ID Token> 필요
// - 지금은 간단하게 ADMIN_UIDS allow-list 방식

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase.admin";

export const runtime = "nodejs";

function isAdminUid(uid: string) {
  const raw = process.env.ADMIN_UIDS ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

    if (!token) {
      return NextResponse.json({ ok: false, reason: "NO_TOKEN" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);

    if (!isAdminUid(decoded.uid)) {
      return NextResponse.json({ ok: false, reason: "NOT_ADMIN" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      uid: decoded.uid,
      email: decoded.email ?? null,
    });
  } catch {
    return NextResponse.json({ ok: false, reason: "INVALID_TOKEN" }, { status: 401 });
  }
}