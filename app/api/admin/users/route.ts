// app/api/admin/users/route.ts
// 회원 목록(listUsers) + 검색(getUserByEmail / getUser)
// - Firebase Auth는 "부분검색"이 안 되므로 이메일/UID "정확히" 검색이 기본

import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase.admin";

export const runtime = "nodejs";

function isAdminUid(uid: string) {
  const raw = process.env.ADMIN_UIDS ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(uid);
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) throw new Error("NO_TOKEN");

  const decoded = await adminAuth.verifyIdToken(token);
  if (!isAdminUid(decoded.uid)) throw new Error("NOT_ADMIN");
  return decoded;
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const pageToken = url.searchParams.get("pageToken") ?? undefined;

    // 검색 모드(정확히)
    if (q) {
      try {
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
        return NextResponse.json({ ok: true, mode: "search", users: [], nextPageToken: null });
      }
    }

    // 목록 모드(페이지네이션)
    const res = await adminAuth.listUsers(Math.min(Math.max(limit, 1), 200), pageToken);

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
    return NextResponse.json({ ok: false, error: msg || "UNAUTHORIZED" }, { status });
  }
}