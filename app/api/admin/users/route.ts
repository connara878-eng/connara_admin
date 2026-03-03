// app/api/admin/users/route.ts
//
// 관리자 회원 목록 / 회원 검색 API
//
// GET /api/admin/users
//   -> 회원 목록 조회
//
// GET /api/admin/users?q=...
//   -> 이메일 또는 UID 정확 검색
//
// Firebase Admin Auth의 특징:
// - "부분 검색"은 기본적으로 지원하지 않음
// - 그래서 이메일 정확히 / UID 정확히 검색이 기본
//
// 이 API는 반드시 관리자만 사용할 수 있어야 하므로
// 요청 초반에 requireAdmin()으로 관리자 검사를 먼저 한다.

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

export async function GET(req: Request) {
  try {
    // 먼저 관리자 여부 확인
    await requireAdmin(req);

    const url = new URL(req.url);

    // 정확 검색용 q
    const q = (url.searchParams.get("q") ?? "").trim();

    // 목록 조회 개수
    const limit = Number(url.searchParams.get("limit") ?? "50");

    // Firebase 페이지네이션용 token
    const pageToken = url.searchParams.get("pageToken") ?? undefined;

    // -----------------------------
    // 검색 모드
    // -----------------------------
    if (q) {
      try {
        // 이메일 형태면 이메일 검색, 아니면 uid 검색
        const u = q.includes("@")
          ? await adminAuth.getUserByEmail(q)
          : await adminAuth.getUser(q);

        return NextResponse.json({
          ok: true,
          mode: "search",
          users: [
            {
              uid: u.uid,
              email: u.email ?? null,
              disabled: u.disabled,
              createdAt: u.metadata.creationTime,
              lastSignInAt: u.metadata.lastSignInTime ?? null,
            },
          ],
          nextPageToken: null,
        });
      } catch {
        // 검색 결과 없을 때는 에러보다는 빈 배열이 더 화면 처리하기 편함
        return NextResponse.json({
          ok: true,
          mode: "search",
          users: [],
          nextPageToken: null,
        });
      }
    }

    // -----------------------------
    // 목록 모드
    // -----------------------------
    // 너무 큰 수가 들어와도 과하게 부르지 않도록 범위 제한
    const safeLimit = Math.min(Math.max(limit, 1), 200);

    const res = await adminAuth.listUsers(safeLimit, pageToken);

    return NextResponse.json({
      ok: true,
      mode: "list",
      users: res.users.map((u) => ({
        uid: u.uid,
        email: u.email ?? null,
        disabled: u.disabled,
        createdAt: u.metadata.creationTime,
        lastSignInAt: u.metadata.lastSignInTime ?? null,
      })),
      nextPageToken: res.pageToken ?? null,
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