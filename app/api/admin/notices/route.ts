// app/api/admin/notices/route.ts

// 관리자 공지사항 목록 조회 / 생성 API
// - GET /api/admin/notices
//   공지 목록 전체 조회
// - POST /api/admin/notices
//   새 공지 생성
//
// 공지 문서 구조 예시
// {
//   title: string,
//   content: string,
//   imageUrl: string | null,
//   isActive: boolean,
//   isPopup: boolean,
//   priority: number,
//   startsAt: Date | null,
//   endsAt: Date | null,
//   createdAt: Date,
//   updatedAt: Date,
// }

import { NextResponse } from "next/server";
// Next.js Route Handler 응답 객체

import { adminAuth, adminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK 인스턴스
// - adminAuth: 관리자 인증 토큰 검증
// - adminDb: Firestore 관리자 권한 읽기/쓰기

export const runtime = "nodejs";
// Firebase Admin SDK 사용이므로 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 에 현재 uid가 포함되는지 확인하는 함수

  const raw = process.env.ADMIN_UIDS ?? "";
  // 관리자 uid 목록 문자열 읽기

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 콤마로 분리 → 공백 제거 → 빈값 제거

  return list.includes(uid);
  // 관리자 uid 목록에 포함되면 true 반환
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
  // 값이 없으면 null 반환

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  // Firestore Timestamp 처리

  if (value instanceof Date) {
    return value.toISOString();
  }
  // Date 객체 처리

  if (typeof value === "string") {
    return value;
  }
  // 이미 문자열이면 그대로 반환

  return null;
  // 그 외 타입은 null 처리
}

function toMillis(value: any) {
  // 정렬용 숫자 timestamp(ms)로 바꾸는 함수

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
  // datetime-local 문자열 또는 null/빈값을 Date | null 로 변환하는 함수

  if (value === null || value === undefined) {
    return null;
  }
  // null/undefined면 null 처리

  if (typeof value !== "string") {
    throw new Error("BAD_REQUEST");
  }
  // 문자열이 아니면 잘못된 요청

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }
  // 빈 문자열이면 null 처리

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error("BAD_REQUEST");
  }
  // 날짜 파싱 실패 시 잘못된 요청 처리

  return date;
}

function parseOptionalImageUrl(value: unknown) {
  // imageUrl 입력값을 string | null 로 정리하는 함수

  if (value === null || value === undefined) {
    return null;
  }
  // 값이 없으면 null

  if (typeof value !== "string") {
    throw new Error("BAD_REQUEST");
  }
  // 문자열이 아니면 잘못된 요청

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }
  // 빈 문자열이면 null

  return trimmed;
  // 문자열이면 그대로 반환
}

function mapNoticeDoc(doc: any) {
  // Firestore 공지 문서를 클라이언트에서 쓰기 쉬운 형태로 변환하는 함수

  const data = doc.data() ?? {};

  return {
    id: doc.id,
    // 공지 문서 id

    title: data.title ?? "",
    // 공지 제목

    content: data.content ?? "",
    // 공지 본문

    imageUrl: data.imageUrl ?? null,
    // 팝업 이미지 URL

    isActive: Boolean(data.isActive),
    // 활성 여부

    isPopup: Boolean(data.isPopup),
    // 팝업 여부

    priority:
      typeof data.priority === "number" && Number.isFinite(data.priority)
        ? data.priority
        : 0,
    // 우선순위 숫자 정리

    startsAt: toIso(data.startsAt),
    // 노출 시작일

    endsAt: toIso(data.endsAt),
    // 노출 종료일

    createdAt: toIso(data.createdAt),
    // 생성일

    updatedAt: toIso(data.updatedAt),
    // 수정일
  };
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

  return NextResponse.json(
    { ok: false, error: "공지사항 처리 실패" },
    { status: 500 }
  );
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const snap = await adminDb.collection("notices").get();
    // notices 컬렉션 전체 조회

    const notices = snap.docs
      .map(mapNoticeDoc)
      .sort((a, b) => {
        // 정렬 기준
        // 1) 활성 공지 우선
        // 2) priority 오름차순
        // 3) createdAt 내림차순

        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1;
        }

        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        return toMillis(b.createdAt) - toMillis(a.createdAt);
      });

    return NextResponse.json({
      ok: true,
      notices,
    });
    // 공지 목록 반환
  } catch (error) {
    return createErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const body = await req.json().catch(() => null);
    // 요청 body JSON 파싱

    if (!body) {
      throw new Error("BAD_REQUEST");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    // 제목 문자열 정리

    const content = typeof body.content === "string" ? body.content.trim() : "";
    // 본문 문자열 정리

    const imageUrl = parseOptionalImageUrl(body.imageUrl);
    // 이미지 URL 정리
    // 파일 업로드는 관리자 페이지에서 먼저 Storage 업로드 후
    // 여기에는 다운로드 URL 문자열만 넘어오게 됨

    const isActive = typeof body.isActive === "boolean" ? body.isActive : false;
    // 활성 여부

    const isPopup = typeof body.isPopup === "boolean" ? body.isPopup : false;
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

    const now = new Date();
    // 생성/수정 시각 공통 사용

    const ref = await adminDb.collection("notices").add({
      title,
      content,
      imageUrl,
      isActive,
      isPopup,
      priority,
      startsAt,
      endsAt,
      createdAt: now,
      updatedAt: now,
    });
    // notices 컬렉션에 새 공지 저장

    const saved = await ref.get();
    // 저장 직후 다시 조회

    return NextResponse.json({
      ok: true,
      notice: mapNoticeDoc(saved),
    });
    // 저장된 공지 데이터만 JSON으로 안전하게 반환
    // 이전처럼 Firestore snapshot 객체 자체를 넣지 않음
  } catch (error) {
    return createErrorResponse(error);
  }
}