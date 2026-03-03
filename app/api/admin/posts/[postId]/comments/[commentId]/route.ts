// app/api/admin/posts/[postId]/comments/[commentId]/route.ts

// 관리자 댓글 숨김 / 해제 / 삭제 API
// - PATCH /api/admin/posts/{postId}/comments/{commentId}
//   body: { isHidden: true | false }
// - DELETE /api/admin/posts/{postId}/comments/{commentId}
// 댓글 삭제 시 parentId 구조를 따라
// 하위 대댓글까지 함께 재귀 삭제

import { NextResponse } from "next/server";
// Next.js JSON 응답 객체

import { adminAuth, adminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK 인스턴스
// - adminAuth: 관리자 토큰 검증
// - adminDb: Firestore 관리자 권한 읽기/쓰기

export const runtime = "nodejs";
// Firebase Admin SDK 사용이므로 nodejs runtime 사용

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

  const decoded = await adminAuth.verifyIdToken(token);
  // Firebase ID Token 검증

  if (!isAdminUid(decoded.uid)) {
    throw new Error("NOT_ADMIN");
  }
  // 관리자 uid 목록에 없으면 권한 없음 처리

  return decoded;
  // 검증된 사용자 정보 반환
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
      { ok: false, error: "잘못된 요청입니다." },
      { status: 400 }
    );
  }
  // 요청 body 형식이 잘못된 경우

  if (msg.includes("COMMENT_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "댓글을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
  // 댓글이 존재하지 않는 경우

  return NextResponse.json(
    { ok: false, error: "댓글 처리 실패" },
    { status: 500 }
  );
  // 그 외 서버 오류
}

async function ensureCommentExists(postId: string, commentId: string) {
  // 대상 댓글이 실제로 존재하는지 확인하는 함수
  // 존재하지 않으면 404 성격의 에러를 던짐

  const ref = adminDb
    .collection("posts")
    .doc(postId)
    .collection("comments")
    .doc(commentId);
  // posts/{postId}/comments/{commentId} 문서 참조

  const snap = await ref.get();
  // 댓글 문서 조회

  if (!snap.exists) {
    throw new Error("COMMENT_NOT_FOUND");
  }
  // 댓글이 없으면 에러

  return ref;
  // 있으면 댓글 문서 참조 반환
}

async function deleteCommentTree(postId: string, commentId: string) {
  // 특정 댓글과 그 하위 대댓글까지 재귀적으로 삭제하는 함수
  // CommentThread 구조처럼 parentId 기반 계층형 댓글을 전제로 함

  const commentsRef = adminDb.collection("posts").doc(postId).collection("comments");
  // posts/{postId}/comments 서브컬렉션 참조

  const childrenSnap = await commentsRef.where("parentId", "==", commentId).get();
  // 현재 댓글을 부모로 가지는 자식 댓글들 조회

  for (const child of childrenSnap.docs) {
    await deleteCommentTree(postId, child.id);
  }
  // 자식 댓글이 있으면
  // 먼저 그 자식의 하위 댓글까지 전부 재귀 삭제

  await commentsRef.doc(commentId).delete();
  // 마지막에 현재 댓글 문서 삭제
  // 자식부터 지운 뒤 부모를 지우는 순서
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { postId, commentId } = await ctx.params;
    // 동적 경로에서 게시글 id, 댓글 id 추출

    const body = await req.json().catch(() => null);
    // 요청 body JSON 파싱
    // 실패하면 null 처리

    if (!body || typeof body.isHidden !== "boolean") {
      throw new Error("BAD_REQUEST");
    }
    // isHidden 값이 실제 boolean인지 검사
    // 잘못된 값이 조용히 false로 바뀌는 상황을 막기 위함

    const commentRef = await ensureCommentExists(postId, commentId);
    // 대상 댓글 존재 여부 확인

    await commentRef.update({
      isHidden: body.isHidden,
      updatedAt: new Date(),
    });
    // 댓글 문서에 숨김 상태와 수정 시각 갱신

    return NextResponse.json({
      ok: true,
      postId,
      commentId,
      isHidden: body.isHidden,
    });
    // 성공 응답 반환
  } catch (error) {
    return createErrorResponse(error);
    // 상황별 공통 에러 응답 반환
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ postId: string; commentId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { postId, commentId } = await ctx.params;
    // 동적 경로에서 게시글 id, 댓글 id 추출

    await ensureCommentExists(postId, commentId);
    // 삭제 전에 대상 댓글이 실제로 존재하는지 확인

    await deleteCommentTree(postId, commentId);
    // 현재 댓글과 하위 대댓글까지 재귀 삭제

    return NextResponse.json({
      ok: true,
      postId,
      commentId,
      deleted: true,
    });
    // 성공 응답 반환
  } catch (error) {
    return createErrorResponse(error);
    // 상황별 공통 에러 응답 반환
  }
}