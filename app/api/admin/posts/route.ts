// app/api/admin/posts/route.ts

// 관리자 게시글 목록 조회 API
// - GET /api/admin/posts
// - q: 제목 / 내용 / 작성자 / 카테고리 / 게시글 id 검색
// - hidden: all | true | false
// - limit: 최대 조회 개수(기본 100, 최대 200)
// - Firestore posts 컬렉션에서 최신 글을 가져온 뒤
//   서버에서 숨김 필터 / 검색 필터를 적용해서 반환

import { NextResponse } from "next/server";
// Next.js Route Handler에서 JSON 응답을 만들기 위한 객체

import { adminAuth, adminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK 인스턴스
// - adminAuth: ID Token 검증
// - adminDb: Firestore 관리자 권한 읽기/쓰기

export const runtime = "nodejs";
// Firebase Admin SDK를 사용하므로 edge가 아니라 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 에 현재 uid가 포함되는지 검사하는 함수
  // 예: ADMIN_UIDS="uid1,uid2,uid3"

  const raw = process.env.ADMIN_UIDS ?? "";
  // 환경변수에서 관리자 uid 목록 원본 문자열 읽기
  // 값이 없으면 빈 문자열로 처리

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 콤마 기준으로 나누고
  // 앞뒤 공백 제거 후
  // 빈 문자열은 제거

  return list.includes(uid);
  // 현재 uid가 관리자 목록에 포함되어 있으면 true 반환
}

async function requireAdmin(req: Request) {
  // 요청자가 실제 관리자 계정인지 검증하는 공통 함수
  // 모든 관리자 API에서 먼저 호출해서 인증/인가를 통과시킴

  const authHeader = req.headers.get("authorization") ?? "";
  // Authorization 헤더 읽기
  // 예: "Bearer eyJhbGciOi..."

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : "";
  // Bearer 접두사가 있으면 토큰 부분만 잘라냄
  // 형식이 맞지 않으면 빈 문자열 처리

  if (!token) {
    throw new Error("NO_TOKEN");
  }
  // 토큰이 없으면 인증 자체가 불가능하므로 에러

  const decoded = await adminAuth.verifyIdToken(token);
  // Firebase ID Token 검증
  // 성공하면 uid 등의 정보가 들어있는 decoded 토큰 반환

  if (!isAdminUid(decoded.uid)) {
    throw new Error("NOT_ADMIN");
  }
  // 토큰은 유효하지만 관리자 uid 목록에 없으면 권한 없음 처리

  return decoded;
  // 검증된 사용자 정보 반환
}

function toIso(value: any) {
  // Firestore Timestamp / Date / 문자열 값을
  // 화면에서 쓰기 쉬운 ISO 문자열로 변환하는 함수

  if (!value) return null;
  // 값이 없으면 null 반환

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  // Firestore Timestamp 객체면 Date로 바꾼 뒤 ISO 문자열 반환

  if (value instanceof Date) {
    return value.toISOString();
  }
  // Date 객체면 그대로 ISO 문자열 반환

  if (typeof value === "string") {
    return value;
  }
  // 이미 문자열이면 그대로 반환

  return null;
  // 그 외 타입은 null 처리
}

function createErrorResponse(error: unknown) {
  // API 공통 에러 응답 생성 함수
  // 에러 메시지 종류에 따라 status / message를 구분해서 반환

  const msg = String((error as any)?.message ?? "");

  if (msg.includes("NOT_ADMIN")) {
    return NextResponse.json(
      { ok: false, error: "관리자 권한이 없습니다." },
      { status: 403 }
    );
  }
  // 토큰은 유효하지만 관리자 권한이 없는 경우

  if (msg.includes("NO_TOKEN")) {
    return NextResponse.json(
      { ok: false, error: "인증 토큰이 없습니다." },
      { status: 401 }
    );
  }
  // Authorization 헤더 또는 Bearer 토큰이 없는 경우

  return NextResponse.json(
    { ok: false, error: "게시글 목록 조회 실패" },
    { status: 500 }
  );
  // 그 외 예외는 서버 오류로 처리
}

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const url = new URL(req.url);
    // 요청 URL 객체 생성

    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    // 검색어 읽기
    // - 없으면 빈 문자열
    // - 앞뒤 공백 제거
    // - 대소문자 구분 없이 검색하기 위해 소문자 변환

    const hidden = (url.searchParams.get("hidden") ?? "all").trim();
    // 숨김 필터값 읽기
    // - 기본값은 all
    // - true / false / all 중 하나로 사용

    const limitValue = Math.min(
      Math.max(Number(url.searchParams.get("limit") ?? 100), 1),
      200
    );
    // limit 파라미터 읽기
    // - 기본값 100
    // - 최소 1, 최대 200으로 제한
    // 너무 큰 조회로 서버가 무거워지는 걸 막기 위한 안전장치

    const hiddenFilter =
      hidden === "true" || hidden === "false" || hidden === "all"
        ? hidden
        : "all";
    // hidden 파라미터가 허용된 값이 아니면 all로 강제 보정

    const snap = await adminDb
      .collection("posts")
      .orderBy("createdAt", "desc")
      .limit(limitValue)
      .get();
    // posts 컬렉션에서 최신 글부터 limitValue 개 조회

    let posts = snap.docs.map((doc) => {
      const data = doc.data();
      // Firestore 문서 데이터 읽기

      return {
        id: doc.id,
        // 게시글 문서 id

        title: data.title ?? "",
        // 제목

        content: data.content ?? "",
        // 내용

        category: data.category ?? null,
        // 카테고리 키

        authorId: data.authorId ?? null,
        // 작성자 uid

        authorName: data.authorName ?? null,
        // 작성자 이름

        isHidden: Boolean(data.isHidden),
        // 관리자 숨김 여부
        // 메인 페이지와 관리자 페이지 모두 이 필드를 기준으로 노출 여부를 판단

        attachmentsCount: Array.isArray(data.attachments)
          ? data.attachments.length
          : 0,
        // attachments 배열이 있으면 개수 저장
        // 없거나 배열이 아니면 0

        createdAt: toIso(data.createdAt),
        // 생성일 문자열

        updatedAt: toIso(data.updatedAt),
        // 수정일 문자열
      };
    });
    // Firestore 문서 배열을 관리자 페이지가 바로 쓰기 좋은 형태로 변환

    if (hiddenFilter === "true") {
      posts = posts.filter((post) => post.isHidden);
    }
    // 숨김 게시글만 보기

    if (hiddenFilter === "false") {
      posts = posts.filter((post) => !post.isHidden);
    }
    // 노출 게시글만 보기

    if (q) {
      posts = posts.filter((post) =>
        [
          post.id,
          post.title,
          post.content,
          post.authorName,
          post.authorId,
          post.category,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }
    // 검색어가 있으면
    // 게시글 id / 제목 / 내용 / 작성자명 / 작성자 uid / 카테고리 기준으로 포함 검색 수행

    return NextResponse.json({
      ok: true,
      posts,
      total: posts.length,
    });
    // 최종 게시글 목록과 개수 반환
  } catch (error) {
    return createErrorResponse(error);
    // 위에서 구분한 공통 에러 응답 반환
  }
}