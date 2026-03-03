// app/api/admin/posts/[postId]/comments/route.ts

// 관리자 댓글 목록 조회 API
// - GET /api/admin/posts/{postId}/comments
// - posts/{postId}/comments 서브컬렉션 기준
// - createdAt 오름차순으로 댓글을 조회
// - parentId / isHidden 포함해서 관리자 화면이 그대로 쓸 수 있는 형태로 반환

import { NextResponse } from "next/server";
// Next.js JSON 응답 객체

import { adminAuth, adminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK 인스턴스
// - adminAuth: 관리자 토큰 검증
// - adminDb: Firestore 관리자 권한 읽기/쓰기

export const runtime = "nodejs";
// Firebase Admin SDK를 사용하므로 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 에 현재 uid가 포함되는지 확인

  const raw = process.env.ADMIN_UIDS ?? "";
  // 관리자 uid 문자열 읽기

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 콤마 분리 → 공백 제거 → 빈값 제거

  return list.includes(uid);
  // 관리자 목록 포함 여부 반환
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

  if (msg.includes("POST_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "게시글을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
  // 게시글이 존재하지 않는 경우

  return NextResponse.json(
    { ok: false, error: "댓글 목록 조회 실패" },
    { status: 500 }
  );
  // 그 외 서버 오류
}

async function ensurePostExists(postId: string) {
  // 댓글을 조회할 대상 게시글이 실제로 존재하는지 확인하는 함수

  const ref = adminDb.collection("posts").doc(postId);
  // posts/{postId} 문서 참조

  const snap = await ref.get();
  // 문서 조회

  if (!snap.exists) {
    throw new Error("POST_NOT_FOUND");
  }
  // 문서가 없으면 404 성격의 에러

  return ref;
  // 존재하면 게시글 문서 참조 반환
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ postId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { postId } = await ctx.params;
    // 동적 경로에서 게시글 id 추출

    const postRef = await ensurePostExists(postId);
    // 게시글이 실제로 존재하는지 확인

    const snap = await postRef.collection("comments").orderBy("createdAt", "asc").get();
    // posts/{postId}/comments 서브컬렉션을
    // createdAt 오름차순으로 조회
    // 오래된 댓글이 먼저 오도록 정렬

    const comments = snap.docs.map((doc) => {
      const data = doc.data();
      // 댓글 문서 데이터 읽기

      return {
        id: doc.id,
        // 댓글 문서 id

        postId,
        // 현재 게시글 id

        authorId: data.authorId ?? null,
        // 작성자 uid

        authorName: data.authorName ?? null,
        // 작성자 이름

        content: data.content ?? "",
        // 댓글 내용

        parentId: data.parentId ?? null,
        // 부모 댓글 id
        // - null이면 부모 댓글
        // - 값이 있으면 대댓글

        isHidden: Boolean(data.isHidden),
        // 관리자 숨김 여부

        createdAt: toIso(data.createdAt),
        // 생성일 문자열

        updatedAt: toIso(data.updatedAt),
        // 수정일 문자열
      };
    });
    // 관리자 페이지에서 바로 렌더링 가능한 형태로 댓글 목록 변환

    return NextResponse.json({
      ok: true,
      comments,
      total: comments.length,
    });
    // 댓글 목록과 총 개수 반환
  } catch (error) {
    return createErrorResponse(error);
    // 상황별 공통 에러 응답 반환
  }
}