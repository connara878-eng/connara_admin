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
  // 관리자 uid 목록에 포함되면 true
}

async function requireAdmin(req: Request) {
  // 요청자가 관리자 계정인지 검증하는 공통 함수

  const authHeader = req.headers.get("authorization") ?? "";
  // Authorization 헤더 읽기

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  // Bearer 접두사를 제거해서 토큰만 추출

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

function mapNoticeDoc(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  // Firestore 공지 문서를 클라이언트에서 쓰기 쉬운 형태로 변환하는 함수

  const data = doc.data();

  return {
    id: doc.id,
    // 공지 문서 id

    title: data.title ?? "",
    // 공지 제목

    content: data.content ?? "",
    // 공지 본문

    isActive: Boolean(data.isActive),
    // 현재 활성화 여부

    isPopup: Boolean(data.isPopup),
    // 팝업 노출 여부

    priority:
      typeof data.priority === "number" && Number.isFinite(data.priority)
        ? data.priority
        : 0,
    // 우선순위
    // 숫자가 작을수록 먼저 노출되도록 사용할 예정

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
  // 관리자 권한 없음

  if (msg.includes("NO_TOKEN")) {
    return NextResponse.json(
      { ok: false, error: "인증 토큰이 없습니다." },
      { status: 401 }
    );
  }
  // 인증 토큰 없음

  if (msg.includes("BAD_REQUEST")) {
    return NextResponse.json(
      { ok: false, error: "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  // 요청 body 형식이 잘못된 경우

  return NextResponse.json(
    { ok: false, error: "공지사항 처리 실패" },
    { status: 500 }
  );
  // 그 외 서버 오류
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const snap = await adminDb.collection("notices").get();
    // notices 컬렉션 전체 조회
    // 데이터가 아주 많지 않은 공지 관리 기준에서는 전체 조회 후 서버 정렬로 충분

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

    const isActive = Boolean(body.isActive);
    // 활성화 여부 boolean 변환

    const isPopup = Boolean(body.isPopup);
    // 팝업 여부 boolean 변환

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
    // 생성/수정 시각에 공통 사용

    const ref = await adminDb.collection("notices").add({
      title,
      content,
      isActive,
      isPopup,
      priority,
      startsAt,
      endsAt,
      createdAt: now,
      updatedAt: now,
    });
    // notices 컬렉션에 새 공지 문서 생성

    const saved = await ref.get();
    // 생성 직후 문서를 다시 읽어서 응답에 사용

    return NextResponse.json({
      ok: true,
      notice: {
        // id: saved.id
        saved,
        ...mapNoticeDoc(
          saved as FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
        ),
      },
    });
    // 생성된 공지 반환
  } catch (error) {
    return createErrorResponse(error);
  }
}