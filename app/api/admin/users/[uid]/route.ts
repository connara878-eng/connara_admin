// app/api/admin/users/[uid]/route.ts
// 유저 정지/해제/삭제
// - PATCH { disabled: true|false }  => Auth 계정 disabled 토글
// - DELETE                         => Auth 계정 삭제(복구 어려움)

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

export async function PATCH(req: Request, ctx: { params: { uid: string } }) {
  try {
    await requireAdmin(req);

    const uid = ctx.params.uid;
    const body = await req.json().catch(() => ({}));
    const disabled = Boolean(body?.disabled);

    await adminAuth.updateUser(uid, { disabled });

    return NextResponse.json({ ok: true, uid, disabled });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("NOT_ADMIN") ? 403 : 401;
    return NextResponse.json({ ok: false, error: msg || "UNAUTHORIZED" }, { status });
  }
}

export async function DELETE(req: Request, ctx: { params: { uid: string } }) {
  try {
    await requireAdmin(req);

    const uid = ctx.params.uid;
    await adminAuth.deleteUser(uid);

    return NextResponse.json({ ok: true, uid, deleted: true });
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    const status = msg.includes("NOT_ADMIN") ? 403 : 401;
    return NextResponse.json({ ok: false, error: msg || "UNAUTHORIZED" }, { status });
  }
}