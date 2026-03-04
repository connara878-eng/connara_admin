// app/api/admin/notices/route.ts

// 관리자 공지 목록 조회 / 생성 API
// - GET /api/admin/notices
//   공지 목록 전체 조회
// - POST /api/admin/notices
//   새 공지 생성
//
// 공지 문서 구조
// {
//   title: string,
//   content: string,
//   showPopup: boolean,
//   startsAt: Date | null,
//   endsAt: Date | null,
//   createdAt: Date,
//   updatedAt: Date,
// }
//
// 예전 isActive / isPopup 필드는 더 이상 사용하지 않는다.

import { NextResponse } from "next/server";
// Next.js Route Handler 응답 객체

import { getAdminAuth, getAdminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK getter 함수 사용
// notices API에서는 proxy 대신 직접 getter를 써서 문제 가능성을 줄임

export const runtime = "nodejs";
// Firebase Admin SDK 사용이므로 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 안에 현재 uid가 포함되는지 확인하는 함수

  const raw = process.env.ADMIN_UIDS ?? "";
  // 관리자 uid 목록 문자열 읽기

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 콤마 분리 → 공백 제거 → 빈 값 제거

  return list.includes(uid);
  // 관리자 uid 목록 포함 여부 반환
}

async function requireAdmin(req: Request) {
  // 요청자가 관리자 계정인지 검증하는 공통 함수

  const authHeader = req.headers.get("authorization") ?? "";
  // Authorization 헤더 읽기

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  // Bearer 접두사 제거 후 토큰만 추출

  if (!token) {
    throw new Error("NO_TOKEN");
  }
  // 토큰이 없으면 인증 실패

  const adminAuth = getAdminAuth();
  // Firebase Admin Auth 인스턴스를 실제로 가져옴

  const decoded = await adminAuth.verifyIdToken(token);
  // Firebase ID Token 검증

  if (!isAdminUid(decoded.uid)) {
    throw new Error("NOT_ADMIN");
  }
  // 관리자 uid 목록에 없으면 권한 없음 처리

  return decoded;
  // 검증된 사용자 정보 반환
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

function toMillis(value: any) {
  // 정렬용 timestamp 숫자로 바꾸는 함수

  if (!value) return 0;

  if (typeof value?.toDate === "function") {
    return value.toDate().getTime();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }

  return 0;
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

function mapNoticeDoc(doc: { id: string; data: () => any }) {
  // Firestore 공지 문서를 클라이언트에서 쓰기 쉬운 구조로 변환하는 함수

  const data = doc.data() ?? {};

  return {
    id: doc.id,
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
  // 개발 환경에서는 실제 메시지를 detail 로 같이 내려서 원인 파악을 쉽게 한다

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

  return NextResponse.json(
    {
      ok: false,
      error: "공지사항 처리 실패",
      detail: isDev ? msg : undefined,
    },
    { status: 500 }
  );
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const adminDb = getAdminDb();
    // Firestore Admin 인스턴스 직접 생성

    const snap = await adminDb.collection("notices").get();
    // notices 컬렉션 전체 조회

    const notices = snap.docs
      .map((doc) => mapNoticeDoc(doc))
      .sort((a, b) => {
        // 정렬 기준
        // 1) showPopup 켜진 공지 우선
        // 2) updatedAt 내림차순
        // 3) createdAt 내림차순

        if (a.showPopup !== b.showPopup) {
          return a.showPopup ? -1 : 1;
        }

        const byUpdatedAt = toMillis(b.updatedAt) - toMillis(a.updatedAt);

        if (byUpdatedAt !== 0) {
          return byUpdatedAt;
        }

        return toMillis(b.createdAt) - toMillis(a.createdAt);
      });

    return NextResponse.json({
      ok: true,
      notices,
    });
  } catch (error) {
    console.error("[GET /api/admin/notices] failed:", error);
    return createErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

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

    const now = new Date();

    const adminDb = getAdminDb();
    // Firestore Admin 인스턴스 직접 생성

    const ref = await adminDb.collection("notices").add({
      title,
      content,
      showPopup,
      startsAt,
      endsAt,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await ref.get();

    return NextResponse.json({
      ok: true,
      notice: mapNoticeDoc(saved),
    });
  } catch (error) {
    console.error("[POST /api/admin/notices] failed:", error);
    return createErrorResponse(error);
  }
}