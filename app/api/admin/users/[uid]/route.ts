// app/api/admin/users/[uid]/route.ts
//
// 특정 회원 1명에 대해 정지 / 해제 / 삭제를 처리하는 API
//
// PATCH /api/admin/users/[uid]
//   body: { disabled: true | false }
//
// DELETE /api/admin/users/[uid]
//
// 주의:
// - 이 파일도 관리자만 접근 가능해야 함
// - 실제 작업은 Firebase Admin SDK로 수행
// - Next.js 최신 App Router에서는 params를 Promise 형태로 받는 방식이
//   환경에 따라 더 안전할 수 있어서 그 형태로 작성해둠

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase.admin";

export const runtime = "nodejs";

// 관리자 uid 허용 목록 체크
function isAdminUid(uid: string) {
  const raw = process.env.ADMIN_UIDS ?? "";

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return list.includes(uid);
}

// 공통 관리자 인증 함수
async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) throw new Error("NO_TOKEN");

  const decoded = await adminAuth.verifyIdToken(token);

  if (!isAdminUid(decoded.uid)) {
    throw new Error("NOT_ADMIN");
  }

  return decoded;
}

// 회원 정지 / 해제
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ uid: string }> }
) {
  try {
    await requireAdmin(req);

    // 동적 경로의 uid 꺼내기
    const { uid } = await ctx.params;

    // body에서 disabled 값 꺼내기
    const body = await req.json().catch(() => ({}));
    const disabled = Boolean(body?.disabled);

    // Firebase Auth 계정 상태 변경
    await adminAuth.updateUser(uid, { disabled });

    return NextResponse.json({
      ok: true,
      uid,
      disabled,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("NOT_ADMIN") ? 403 : 401;

    return NextResponse.json(
      { ok: false, error: msg || "UNAUTHORIZED" },
      { status }
    );
  }
}

// 회원 삭제
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ uid: string }> }
) {
  try {
    await requireAdmin(req);

    // 동적 경로의 uid 꺼내기
    const { uid } = await ctx.params;

    // Firebase Auth에서 유저 삭제
    await adminAuth.deleteUser(uid);

    return NextResponse.json({
      ok: true,
      uid,
      deleted: true,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("NOT_ADMIN") ? 403 : 401;

    return NextResponse.json(
      { ok: false, error: msg || "UNAUTHORIZED" },
      { status }
    );
  }
}