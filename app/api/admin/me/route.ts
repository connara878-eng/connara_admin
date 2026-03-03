// app/api/admin/me/route.ts
// 서버에서 "이 요청을 보낸 사용자가 진짜 관리자냐?"를 판별하는 API
//
// 클라이언트는 Firebase 로그인만 성공할 수 있어.
// 하지만 로그인했다고 다 관리자면 안 되잖아.
//
// 그래서:
// 1. 클라이언트가 Firebase ID Token을 보냄
// 2. 서버가 그 토큰을 검증
// 3. 검증된 uid가 ADMIN_UIDS 안에 있으면 관리자 통과
//
// 현재는 가장 단순한 allow-list 방식이야.
// 즉 .env.local 의 ADMIN_UIDS 에 등록된 uid만 관리자라고 보는 구조.

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase.admin";

export const runtime = "nodejs";

// 환경변수 ADMIN_UIDS 안에 현재 uid가 들어 있는지 확인
function isAdminUid(uid: string) {
  const raw = process.env.ADMIN_UIDS ?? "";

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return list.includes(uid);
}

export async function GET(req: Request) {
  try {
    // Authorization 헤더에서 Bearer 토큰 꺼내기
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    // 토큰 없으면 인증 실패
    if (!token) {
      return NextResponse.json(
        { ok: false, reason: "NO_TOKEN" },
        { status: 401 }
      );
    }

    // Firebase Admin SDK로 토큰 검증
    const decoded = await adminAuth.verifyIdToken(token);

    // 관리자 uid 목록에 없으면 권한 없음
    if (!isAdminUid(decoded.uid)) {
      return NextResponse.json(
        { ok: false, reason: "NOT_ADMIN" },
        { status: 403 }
      );
    }

    // 관리자면 최소 정보 반환
    return NextResponse.json({
      ok: true,
      uid: decoded.uid,
      email: decoded.email ?? null,
    });
  } catch {
    // 토큰이 잘못되었거나 만료됐거나 검증 실패
    return NextResponse.json(
      { ok: false, reason: "INVALID_TOKEN" },
      { status: 401 }
    );
  }
}