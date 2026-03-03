// app/api/admin/posts/[postId]/route.ts

// 관리자 게시글 숨김 / 해제 / 삭제 API
// - PATCH /api/admin/posts/{postId}
//   body: { isHidden: true | false }
// - DELETE /api/admin/posts/{postId}
// 게시글 삭제 시
// - comments 서브컬렉션
// - likes 서브컬렉션
// - reports 서브컬렉션
// - _attachments_log 서브컬렉션
// 도 함께 삭제한 뒤 마지막에 게시글 문서를 삭제

import { NextResponse } from "next/server";
// Next.js Route Handler 응답 객체

import { adminAuth, adminDb } from "@/lib/firebase.admin";
// Firebase Admin SDK 인스턴스
// - adminAuth: 관리자 토큰 검증
// - adminDb: Firestore 관리자 권한 읽기/쓰기

export const runtime = "nodejs";
// Firebase Admin SDK 사용이므로 nodejs runtime 사용

function isAdminUid(uid: string) {
  // 환경변수 ADMIN_UIDS 에 현재 uid가 포함되는지 확인하는 함수

  const raw = process.env.ADMIN_UIDS ?? "";
  // 관리자 uid 문자열 읽기

  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 콤마 분리 → 공백 제거 → 빈값 제거

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
  // Bearer 접두사 제거 후 순수 토큰만 추출

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
  // 상황별로 status code와 메시지를 분리해서 반환

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

  if (msg.includes("POST_NOT_FOUND")) {
    return NextResponse.json(
      { ok: false, error: "게시글을 찾을 수 없습니다." },
      { status: 404 }
    );
  }
  // 대상 게시글이 존재하지 않는 경우

  return NextResponse.json(
    { ok: false, error: "게시글 처리 실패" },
    { status: 500 }
  );
  // 그 외 서버 오류
}

async function ensurePostExists(postId: string) {
  // 대상 게시글이 실제로 존재하는지 확인하는 함수
  // 존재하지 않으면 404 성격의 에러를 던짐

  const ref = adminDb.collection("posts").doc(postId);
  // posts/{postId} 문서 참조

  const snap = await ref.get();
  // 문서 조회

  if (!snap.exists) {
    throw new Error("POST_NOT_FOUND");
  }
  // 문서가 없으면 에러

  return ref;
  // 있으면 문서 참조 반환
}

async function deleteSubcollection(
  postId: string,
  subcollectionName: string,
  batchSize = 300
) {
  // 특정 게시글의 특정 서브컬렉션 문서를 batch 단위로 반복 삭제하는 함수
  // Firestore는 부모 문서를 지워도 서브컬렉션이 자동 삭제되지 않기 때문에
  // 필요한 서브컬렉션을 직접 순회하며 지워야 함

  while (true) {
    const snap = await adminDb
      .collection("posts")
      .doc(postId)
      .collection(subcollectionName)
      .limit(batchSize)
      .get();
    // 서브컬렉션 문서를 batchSize 개씩 조회

    if (snap.empty) break;
    // 더 이상 삭제할 문서가 없으면 종료

    const batch = adminDb.batch();
    // Firestore batch 생성

    snap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    // 현재 조회된 문서들을 batch 삭제 대상으로 등록

    await batch.commit();
    // 실제 삭제 실행

    if (snap.size < batchSize) break;
    // 이번에 가져온 개수가 batchSize보다 적으면
    // 거의 마지막 묶음이므로 종료
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ postId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { postId } = await ctx.params;
    // 동적 경로에서 게시글 id 추출

    const body = await req.json().catch(() => null);
    // 요청 body JSON 파싱
    // 파싱 실패 시 null 처리

    if (!body || typeof body.isHidden !== "boolean") {
      throw new Error("BAD_REQUEST");
    }
    // isHidden 값이 boolean이 아니면 잘못된 요청으로 처리
    // 예전처럼 Boolean(...) 강제 변환을 쓰면
    // 잘못된 값도 false로 바뀌어 의도치 않게 숨김 해제될 수 있음

    const isHidden = body.isHidden;
    // 검증된 boolean 값 저장

    const postRef = await ensurePostExists(postId);
    // 대상 게시글이 실제로 존재하는지 확인

    await postRef.update({
      isHidden,
      updatedAt: new Date(),
    });
    // 게시글 문서에 숨김 상태와 수정 시각 반영

    return NextResponse.json({
      ok: true,
      postId,
      isHidden,
    });
    // 성공 응답 반환
  } catch (error) {
    return createErrorResponse(error);
    // 상황별 공통 에러 응답 반환
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ postId: string }> }
) {
  try {
    await requireAdmin(req);
    // 관리자 인증 먼저 수행

    const { postId } = await ctx.params;
    // 삭제할 게시글 id 추출

    const postRef = await ensurePostExists(postId);
    // 삭제 전에 게시글 존재 여부 확인

    await deleteSubcollection(postId, "comments");
    // 댓글 서브컬렉션 삭제

    await deleteSubcollection(postId, "likes");
    // 좋아요 서브컬렉션 삭제

    await deleteSubcollection(postId, "reports");
    // 신고 서브컬렉션 삭제

    await deleteSubcollection(postId, "_attachments_log");
    // 첨부 업로드 로그 서브컬렉션 삭제

    await postRef.delete();
    // 마지막으로 게시글 문서 삭제

    return NextResponse.json({
      ok: true,
      postId,
      deleted: true,
    });
    // 성공 응답 반환
  } catch (error) {
    return createErrorResponse(error);
    // 상황별 공통 에러 응답 반환
  }
}