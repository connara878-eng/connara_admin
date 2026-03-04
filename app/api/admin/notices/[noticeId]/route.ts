// app/api/admin/notices/[noticeId]/route.ts

// 관리자 공지사항 수정 / 삭제 API
// - PATCH /api/admin/notices/{noticeId}
// - DELETE /api/admin/notices/{noticeId}

import { NextResponse } from "next/server";
// Next.js Route Handler 응답 객체

import { adminAuth, adminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK 인스턴스

export const runtime = "nodejs";
// Firebase Admin SDK 사용이므로 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 에 현재 uid가 포함되는지 확인하는 함수

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

function createErrorResponse(error: unknown) {
  // 공통 에러 응답 함수

  const msg = String((error as any)?.message ?? "");

  if (msg.includes("NOT_ADMIN")) {
    return NextResponse.json(
      { ok: false, error: "관리자 권한이 없습니다." },
      { status: 403 }
    );
  }

  if (msg.includes("NO_TOKEN")) {
    return NextResponse.json(
      { ok: false, error: "인증 토큰이 없습니다." },
      { status: 401 }
    );
  }

  if (msg.includes("BAD_REQUEST")) {
    return NextResponse.json(
      { ok: false, error: "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }

  if (msg.includes("NOTICE_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "공지사항을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { ok: false, error: "공지사항 처리 실패" },
    { status: 500 }
  );
}

async function ensureNoticeExists(noticeId: string) {
  // 대상 공지 문서가 실제로 존재하는지 확인하는 함수

  const ref = adminDb.collection("notices").doc(noticeId);
  // notices/{noticeId} 문서 참조

  const snap = await ref.get();
  // 문서 조회

  if (!snap.exists) {
    throw new Error("NOTICE_NOT_FOUND");
  }
  // 문서가 없으면 404 성격 에러

  return ref;
  // 있으면 문서 참조 반환
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ noticeId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { noticeId } = await ctx.params;
    // 동적 경로에서 noticeId 추출

    const body = await req.json().catch(() => null);
    // 요청 body JSON 파싱

    if (!body) {
      throw new Error("BAD_REQUEST");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    // 제목 문자열 정리

    const content = typeof body.content === "string" ? body.content.trim() : "";
    // 본문 문자열 정리

    const isActive = Boolean(body.isActive);
    // 활성화 여부

    const isPopup = Boolean(body.isPopup);
    // 팝업 여부

    const priority = Number(body.priority);
    // 우선순위 숫자 변환

    const startsAt = parseOptionalDate(body.startsAt);
    // 시작일 파싱

    const endsAt = parseOptionalDate(body.endsAt);
    // 종료일 파싱

    if (!title || !content) {
      throw new Error("BAD_REQUEST");
    }
    // 제목/본문 필수

    if (!Number.isFinite(priority)) {
      throw new Error("BAD_REQUEST");
    }
    // priority는 유효한 숫자여야 함

    if (startsAt && endsAt && startsAt.getTime() > endsAt.getTime()) {
      throw new Error("BAD_REQUEST");
    }
    // 시작일이 종료일보다 뒤면 잘못된 요청

    const ref = await ensureNoticeExists(noticeId);
    // 수정 전에 공지 존재 여부 확인

    await ref.update({
      title,
      content,
      isActive,
      isPopup,
      priority,
      startsAt,
      endsAt,
      updatedAt: new Date(),
    });
    // 공지 문서 수정

    const saved = await ref.get();
    // 저장 후 다시 읽어서 응답에 반영

    const data = saved.data() ?? {};

    return NextResponse.json({
      ok: true,
      notice: {
        id: saved.id,
        title: data.title ?? "",
        content: data.content ?? "",
        isActive: Boolean(data.isActive),
        isPopup: Boolean(data.isPopup),
        priority:
          typeof data.priority === "number" && Number.isFinite(data.priority)
            ? data.priority
            : 0,
        startsAt: toIso(data.startsAt),
        endsAt: toIso(data.endsAt),
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      },
    });
    // 수정된 공지 반환
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ noticeId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { noticeId } = await ctx.params;
    // 동적 경로에서 noticeId 추출

    const ref = await ensureNoticeExists(noticeId);
    // 삭제 전에 문서 존재 여부 확인

    await ref.delete();
    // 공지 문서 삭제

    return NextResponse.json({
      ok: true,
      noticeId,
      deleted: true,
    });
    // 성공 응답 반환
  } catch (error) {
    return createErrorResponse(error);
  }
}