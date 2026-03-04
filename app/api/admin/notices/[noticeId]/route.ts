// app/api/admin/notices/[noticeId]/route.ts

// 관리자 공지 수정 / 삭제 API
// - PATCH /api/admin/notices/{noticeId}
// - DELETE /api/admin/notices/{noticeId}

import { NextResponse } from "next/server";
// Next.js Route Handler 응답 객체

import { getAdminAuth, getAdminDb } from "@/lib/firebase.admin";
// notices API에서는 proxy 대신 getter 함수를 직접 사용

export const runtime = "nodejs";
// Firebase Admin SDK 사용이므로 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 안에 현재 uid가 포함되는지 확인

  const raw = process.env.ADMIN_UIDS ?? "";

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return list.includes(uid);
}

async function requireAdmin(req: Request) {
  // 요청자가 관리자 계정인지 검증하는 공통 함수

  const authHeader = req.headers.get("authorization") ?? "";

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";

  if (!token) {
    throw new Error("NO_TOKEN");
  }

  const adminAuth = getAdminAuth();
  // Firebase Admin Auth 인스턴스 직접 생성

  const decoded = await adminAuth.verifyIdToken(token);

  if (!isAdminUid(decoded.uid)) {
    throw new Error("NOT_ADMIN");
  }

  return decoded;
}

function toIso(value: any) {
  // Firestore Timestamp / Date / 문자열을 ISO 문자열로 바꾸는 함수

  if (!value) return null;

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

function parseOptionalDate(value: unknown) {
  // datetime-local 문자열 또는 null/빈값을 Date | null 로 바꾸는 함수

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("BAD_REQUEST");
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error("BAD_REQUEST");
  }

  return date;
}

function mapNoticeData(id: string, data: any) {
  // 공지 문서 데이터를 응답용 순수 JSON 구조로 변환하는 함수

  return {
    id,
    title: data.title ?? "",
    content: data.content ?? "",
    showPopup: Boolean(data.showPopup),
    startsAt: toIso(data.startsAt),
    endsAt: toIso(data.endsAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function createErrorResponse(error: unknown) {
  // 공통 에러 응답 함수

  const msg = String((error as any)?.message ?? "");
  const isDev = process.env.NODE_ENV !== "production";

  if (msg.includes("NOT_ADMIN")) {
    return NextResponse.json(
      {
        ok: false,
        error: "관리자 권한이 없습니다.",
        detail: isDev ? msg : undefined,
      },
      { status: 403 }
    );
  }

  if (msg.includes("NO_TOKEN")) {
    return NextResponse.json(
      {
        ok: false,
        error: "인증 토큰이 없습니다.",
        detail: isDev ? msg : undefined,
      },
      { status: 401 }
    );
  }

  if (msg.includes("BAD_REQUEST")) {
    return NextResponse.json(
      {
        ok: false,
        error: "입력값이 올바르지 않습니다.",
        detail: isDev ? msg : undefined,
      },
      { status: 400 }
    );
  }

  if (msg.includes("NOTICE_NOT_FOUND")) {
    return NextResponse.json(
      {
        ok: false,
        error: "공지사항을 찾을 수 없습니다.",
        detail: isDev ? msg : undefined,
      },
      { status: 404 }
    );
  }

  return NextResponse.json(
    {
      ok: false,
      error: "공지사항 처리 실패",
      detail: isDev ? msg : undefined,
    },
    { status: 500 }
  );
}

async function ensureNoticeExists(noticeId: string) {
  // 대상 공지 문서가 실제로 존재하는지 확인하는 함수

  const adminDb = getAdminDb();
  const ref = adminDb.collection("notices").doc(noticeId);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error("NOTICE_NOT_FOUND");
  }

  return ref;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ noticeId: string }> }
) {
  try {
    await requireAdmin(req);

    const { noticeId } = await ctx.params;
    const body = await req.json().catch(() => null);

    if (!body) {
      throw new Error("BAD_REQUEST");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (typeof body.showPopup !== "boolean") {
      throw new Error("BAD_REQUEST");
    }

    const showPopup = body.showPopup;
    const startsAt = parseOptionalDate(body.startsAt);
    const endsAt = parseOptionalDate(body.endsAt);

    if (!title || !content) {
      throw new Error("BAD_REQUEST");
    }

    if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
      throw new Error("BAD_REQUEST");
    }

    const ref = await ensureNoticeExists(noticeId);

    await ref.update({
      title,
      content,
      showPopup,
      startsAt,
      endsAt,
      updatedAt: new Date(),
    });

    const saved = await ref.get();

    return NextResponse.json({
      ok: true,
      notice: mapNoticeData(saved.id, saved.data() ?? {}),
    });
  } catch (error) {
    console.error("[PATCH /api/admin/notices/[noticeId]] failed:", error);
    return createErrorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ noticeId: string }> }
) {
  try {
    await requireAdmin(req);

    const { noticeId } = await ctx.params;
    const ref = await ensureNoticeExists(noticeId);

    await ref.delete();

    return NextResponse.json({
      ok: true,
      noticeId,
      deleted: true,
    });
  } catch (error) {
    console.error("[DELETE /api/admin/notices/[noticeId]] failed:", error);
    return createErrorResponse(error);
  }
}