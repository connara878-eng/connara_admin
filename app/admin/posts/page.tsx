"use client";

// app/admin/posts/page.tsx

// 관리자 게시글 관리 페이지
// - 자유게시판 posts 컬렉션 기준
// - 게시글 목록 조회
// - 검색 / 숨김 필터
// - 게시글 숨김 / 해제 / 삭제
// - 선택한 게시글의 댓글 조회
// - 댓글 숨김 / 해제 / 삭제
// - 현재 필터 상태에 맞춰 목록을 즉시 갱신
// - 댓글은 부모/대댓글 구조를 보기 쉽게 정렬해서 표시

import { useCallback, useEffect, useMemo, useState } from "react";
// React 훅들
// - useState: 목록/검색어/로딩/선택 상태/알림 상태 관리
// - useEffect: 최초 진입 시 게시글 목록 자동 조회
// - useCallback: API 호출 함수 재생성 최소화
// - useMemo: 요약 수치/선택 게시글/댓글 트리 계산 최적화

import { auth } from "@/lib/firebase.client";
// 현재 로그인한 관리자 계정의 Firebase ID Token을 가져오기 위해 사용
// 관리자 API 호출 시 Authorization 헤더에 Bearer 토큰으로 전달

type AdminPostRow = {
  id: string;
  // 게시글 문서 id

  title: string;
  // 게시글 제목

  content: string;
  // 게시글 본문 내용

  category: string | null;
  // 게시글 카테고리 키

  authorId: string | null;
  // 작성자 uid

  authorName: string | null;
  // 작성자 이름

  isHidden: boolean;
  // 관리자 숨김 여부

  attachmentsCount: number;
  // 첨부파일 개수

  createdAt: string | null;
  // 생성일 문자열

  updatedAt: string | null;
  // 수정일 문자열
};

type AdminCommentRow = {
  id: string;
  // 댓글 문서 id

  postId: string;
  // 소속 게시글 id

  authorId: string | null;
  // 작성자 uid

  authorName: string | null;
  // 작성자 이름

  content: string;
  // 댓글 본문

  parentId: string | null;
  // 부모 댓글 id
  // - null이면 부모 댓글
  // - 값이 있으면 대댓글

  isHidden: boolean;
  // 관리자 숨김 여부

  createdAt: string | null;
  // 생성일 문자열

  updatedAt: string | null;
  // 수정일 문자열
};

type Notice = {
  type: "success" | "error";
  // success면 초록 계열 안내
  // error면 빨간 계열 안내

  text: string;
  // 화면 상단에 보여줄 실제 메시지
};

type ThreadedCommentRow = AdminCommentRow & {
  depth: number;
  // 댓글 트리 렌더링용 깊이 값
  // 0이면 부모 댓글
  // 1 이상이면 대댓글(들여쓰기용)
};

async function getIdTokenOrThrow() {
  // 현재 로그인한 관리자 계정의 Firebase ID Token을 가져오는 함수
  // 관리자 API 호출 전에 이 토큰을 Authorization 헤더에 붙임

  const u = auth.currentUser;
  // 현재 로그인한 유저 정보 읽기

  if (!u) throw new Error("NO_LOGIN");
  // 로그인 정보가 없으면 API 호출 자체가 불가능하므로 예외 처리

  return await u.getIdToken();
  // Firebase ID Token 반환
}

function formatDate(value: string | null) {
  // ISO 문자열 / 날짜 문자열을 한국식 보기 좋은 날짜로 바꾸는 함수

  if (!value) return "-";
  // 값이 없으면 하이픈으로 표시

  const d = new Date(value);
  // Date 객체로 변환

  if (Number.isNaN(d.getTime())) return value;
  // 변환 실패 시 원본 문자열 그대로 반환

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  // 한국 시간 형식으로 포맷해서 반환
}

function truncateText(value: string, max = 110) {
  // 게시글 목록에서 본문을 너무 길지 않게 잘라주는 함수

  if (!value) return "";
  // 값이 없으면 빈 문자열 반환

  if (value.length <= max) return value;
  // 최대 길이보다 짧으면 그대로 사용

  return `${value.slice(0, max)}...`;
  // 최대 길이를 넘으면 뒤에 ...을 붙여 축약
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<AdminPostRow[]>([]);
  // 현재 화면에 보여줄 게시글 목록 상태

  const [comments, setComments] = useState<AdminCommentRow[]>([]);
  // 현재 선택된 게시글의 댓글 목록 상태

  const [q, setQ] = useState("");
  // 게시글 검색어 입력값 상태

  const [hiddenFilter, setHiddenFilter] = useState<"all" | "true" | "false">(
    "all"
  );
  // 숨김 필터 상태
  // - all: 전체
  // - true: 숨김 글만
  // - false: 노출 글만

  const [loadingPosts, setLoadingPosts] = useState(true);
  // 게시글 목록 로딩 여부

  const [loadingComments, setLoadingComments] = useState(false);
  // 댓글 목록 로딩 여부

  const [notice, setNotice] = useState<Notice | null>(null);
  // 화면 상단 알림 메시지 상태

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  // 현재 댓글 패널에서 보고 있는 게시글 id

  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  // 게시글 숨김/해제/삭제 처리 중인 게시글 id

  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  // 댓글 숨김/해제/삭제 처리 중인 댓글 id

  const loadPosts = useCallback(async () => {
    // 관리자 게시글 목록을 불러오는 함수
    // 검색어(q)와 숨김 필터(hiddenFilter)를 포함해서 API 호출

    setNotice(null);
    // 이전 알림 메시지를 먼저 비움

    setLoadingPosts(true);
    // 게시글 목록 로딩 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const params = new URLSearchParams();
      // 쿼리스트링 구성을 위한 객체 생성

      if (q.trim()) {
        params.set("q", q.trim());
      }
      // 검색어가 있으면 q 파라미터 추가

      params.set("hidden", hiddenFilter);
      // 숨김 필터값 추가

      const res = await fetch(`/api/admin/posts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 인증 토큰 전달
        },
        cache: "no-store",
        // 최신 상태를 보기 위해 캐시 없이 요청
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setNotice({
          type: "error",
          text: data?.error ?? "게시글 목록 조회 실패",
        });
        // API 실패 시 에러 메시지 표시

        return;
      }

      const nextPosts = data.posts ?? [];
      // 응답 게시글 목록 꺼내기

      setPosts(nextPosts);
      // 게시글 목록 상태 반영

      if (
        selectedPostId &&
        !nextPosts.some((post: AdminPostRow) => post.id === selectedPostId)
      ) {
        setSelectedPostId(null);
        // 현재 선택 중인 게시글이 새 목록에서 사라졌다면 선택 해제

        setComments([]);
        // 댓글 패널도 함께 비움
      }
    } catch {
      setNotice({
        type: "error",
        text: "게시글 목록 조회 실패",
      });
      // 네트워크 오류 등 예외 상황 처리
    } finally {
      setLoadingPosts(false);
      // 성공/실패와 상관없이 로딩 종료
    }
  }, [q, hiddenFilter, selectedPostId]);

  const loadComments = useCallback(async (postId: string) => {
    // 특정 게시글의 댓글 목록을 불러오는 함수
    // 관리자 댓글 관리 패널에서 선택한 게시글 기준으로 동작

    setNotice(null);
    // 이전 알림 초기화

    setLoadingComments(true);
    // 댓글 목록 로딩 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 토큰 가져오기

      const res = await fetch(`/api/admin/posts/${postId}/comments`, {
        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 인증 토큰 전달
        },
        cache: "no-store",
        // 최신 댓글을 보기 위해 캐시 없이 요청
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setNotice({
          type: "error",
          text: data?.error ?? "댓글 목록 조회 실패",
        });
        // 실패 메시지 표시

        return;
      }

      setComments(data.comments ?? []);
      // 댓글 목록 상태 저장
    } catch {
      setNotice({
        type: "error",
        text: "댓글 목록 조회 실패",
      });
      // 네트워크 오류 등 예외 처리
    } finally {
      setLoadingComments(false);
      // 댓글 로딩 종료
    }
  }, []);

  const clearSelectedPost = () => {
    // 현재 선택된 게시글과 댓글 패널을 비우는 함수

    setSelectedPostId(null);
    // 선택된 게시글 해제

    setComments([]);
    // 댓글 목록 초기화
  };

  const syncPostListAfterHiddenChange = (
    postId: string,
    nextIsHidden: boolean
  ) => {
    // 게시글 숨김/해제 후 현재 목록을 즉시 화면에 반영하는 함수

    const shouldDisappearBecauseOfFilter =
      (hiddenFilter === "false" && nextIsHidden) ||
      (hiddenFilter === "true" && !nextIsHidden);
    // 현재 필터와 바뀐 상태가 충돌하면 목록에서 즉시 제거

    if (shouldDisappearBecauseOfFilter) {
      setPosts((prev) => prev.filter((post) => post.id !== postId));
      // 현재 목록에서 해당 게시글 제거

      if (selectedPostId === postId) {
        clearSelectedPost();
        // 현재 보고 있던 글이 사라지는 경우 댓글 패널도 닫음
      }

      return;
    }

    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId ? { ...post, isHidden: nextIsHidden } : post
      )
    );
    // 목록에서 사라질 필요가 없으면 isHidden 값만 갱신
  };

  const setPostHidden = async (postId: string, isHidden: boolean) => {
    // 게시글 숨김 / 해제 처리 함수

    setNotice(null);
    // 이전 알림 초기화

    setBusyPostId(postId);
    // 현재 처리 중인 게시글 id 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch(`/api/admin/posts/${postId}`, {
        method: "PATCH",
        // 일부 상태만 바꾸므로 PATCH 사용

        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 토큰 전달

          "Content-Type": "application/json",
          // JSON body 전송을 위해 지정
        },

        body: JSON.stringify({ isHidden }),
        // 서버에 바뀔 숨김 상태 전달
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setNotice({
          type: "error",
          text: data?.error ?? "게시글 상태 변경 실패",
        });
        // 실패 메시지 표시

        return;
      }

      syncPostListAfterHiddenChange(postId, isHidden);
      // 성공하면 현재 목록 상태를 즉시 반영

      setNotice({
        type: "success",
        text: isHidden
          ? "게시글을 숨김 처리했어요."
          : "게시글 숨김을 해제했어요.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "게시글 상태 변경 실패",
      });
    } finally {
      setBusyPostId(null);
      // 처리 종료 후 busy 상태 해제
    }
  };

  const deletePost = async (postId: string) => {
    // 게시글 삭제 함수

    const ok = confirm(
      "정말 게시글을 삭제하시겠습니까?\n댓글 / 좋아요 / 신고 / 첨부로그도 함께 삭제됩니다."
    );
    // 사용자 확인창 표시

    if (!ok) return;
    // 취소하면 중단

    setNotice(null);
    // 이전 알림 초기화

    setBusyPostId(postId);
    // 현재 처리 중인 게시글 id 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch(`/api/admin/posts/${postId}`, {
        method: "DELETE",
        // 게시글 삭제 요청이므로 DELETE 사용

        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 토큰 전달
        },
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setNotice({
          type: "error",
          text: data?.error ?? "게시글 삭제 실패",
        });
        return;
      }

      setPosts((prev) => prev.filter((post) => post.id !== postId));
      // 화면 목록에서 삭제된 게시글 제거

      if (selectedPostId === postId) {
        clearSelectedPost();
        // 현재 보고 있던 게시글을 삭제한 경우 댓글 패널도 닫기
      }

      setNotice({
        type: "success",
        text: "게시글을 삭제했어요.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "게시글 삭제 실패",
      });
    } finally {
      setBusyPostId(null);
      // 처리 종료 후 busy 상태 해제
    }
  };

  const setCommentHidden = async (
    postId: string,
    commentId: string,
    isHidden: boolean
  ) => {
    // 댓글 숨김 / 해제 처리 함수

    setNotice(null);
    // 이전 알림 초기화

    setBusyCommentId(commentId);
    // 현재 처리 중인 댓글 id 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch(
        `/api/admin/posts/${postId}/comments/${commentId}`,
        {
          method: "PATCH",
          // 댓글 일부 상태만 바꾸므로 PATCH 사용

          headers: {
            Authorization: `Bearer ${token}`,
            // 관리자 토큰 전달

            "Content-Type": "application/json",
            // JSON body 전송을 위한 타입 지정
          },

          body: JSON.stringify({ isHidden }),
          // 서버에 바뀔 숨김 상태 전달
        }
      );

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setNotice({
          type: "error",
          text: data?.error ?? "댓글 상태 변경 실패",
        });
        return;
      }

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId ? { ...comment, isHidden } : comment
        )
      );
      // 성공 시 현재 댓글 목록 상태도 즉시 갱신

      setNotice({
        type: "success",
        text: isHidden ? "댓글을 숨김 처리했어요." : "댓글 숨김을 해제했어요.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "댓글 상태 변경 실패",
      });
    } finally {
      setBusyCommentId(null);
      // 처리 종료 후 busy 상태 해제
    }
  };

  const deleteComment = async (postId: string, commentId: string) => {
    // 댓글 삭제 함수

    const ok = confirm(
      "정말 댓글을 삭제하시겠습니까?\n대댓글이 있으면 함께 삭제됩니다."
    );
    // 사용자 확인창 표시

    if (!ok) return;
    // 취소하면 중단

    setNotice(null);
    // 이전 알림 초기화

    setBusyCommentId(commentId);
    // 현재 처리 중인 댓글 id 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch(
        `/api/admin/posts/${postId}/comments/${commentId}`,
        {
          method: "DELETE",
          // 댓글 삭제 요청이므로 DELETE 사용

          headers: {
            Authorization: `Bearer ${token}`,
            // 관리자 토큰 전달
          },
        }
      );

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setNotice({
          type: "error",
          text: data?.error ?? "댓글 삭제 실패",
        });
        return;
      }

      await loadComments(postId);
      // 삭제 후 댓글 구조가 바뀔 수 있으므로 다시 조회

      setNotice({
        type: "success",
        text: "댓글을 삭제했어요.",
      });
    } catch {
      setNotice({
        type: "error",
        text: "댓글 삭제 실패",
      });
    } finally {
      setBusyCommentId(null);
      // 처리 종료 후 busy 상태 해제
    }
  };

  useEffect(() => {
    loadPosts();
    // 페이지 최초 진입 시 게시글 목록 자동 조회
  }, [loadPosts]);

  const totalCount = useMemo(() => posts.length, [posts]);
  // 현재 화면에 보이는 게시글 전체 개수

  const visibleCount = useMemo(
    () => posts.filter((post) => !post.isHidden).length,
    [posts]
  );
  // 현재 화면에 보이는 노출 게시글 개수

  const hiddenCount = useMemo(
    () => posts.filter((post) => post.isHidden).length,
    [posts]
  );
  // 현재 화면에 보이는 숨김 게시글 개수

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId]
  );
  // 현재 댓글 패널에서 선택된 게시글 객체

  const threadedComments = useMemo<ThreadedCommentRow[]>(() => {
    // 댓글 목록을 depth 기반 트리 구조처럼 정렬해서 렌더링하기 위한 계산

    const childrenMap = new Map<string | null, AdminCommentRow[]>();
    // parentId를 key로 하는 자식 댓글 맵

    for (const comment of comments) {
      const key = comment.parentId ?? null;
      // parentId가 없으면 null key = 부모 댓글

      const prev = childrenMap.get(key) ?? [];
      // 현재 key의 배열 가져오기

      prev.push(comment);
      // 댓글 추가

      childrenMap.set(key, prev);
      // 다시 저장
    }

    const result: ThreadedCommentRow[] = [];
    // 최종 렌더링용 댓글 배열

    const walk = (parentId: string | null, depth: number) => {
      const list = childrenMap.get(parentId) ?? [];
      // 현재 parentId를 가진 댓글 목록

      for (const item of list) {
        result.push({ ...item, depth });
        // depth를 붙여 결과에 추가

        walk(item.id, depth + 1);
        // 자식 댓글 재귀 순회
      }
    };

    walk(null, 0);
    // 부모 댓글(null)부터 시작

    return result;
  }, [comments]);

  const visibleCommentsCount = useMemo(
    () => comments.filter((comment) => !comment.isHidden).length,
    [comments]
  );
  // 현재 선택된 게시글의 노출 댓글 수

  const hiddenCommentsCount = useMemo(
    () => comments.filter((comment) => comment.isHidden).length,
    [comments]
  );
  // 현재 선택된 게시글의 숨김 댓글 수

  return (
    <section className="space-y-8">
      <div className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(17,24,39,0.08)]">
        <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6c7cff]">
              Community Moderation
            </p>

            <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900">
              게시글 관리
            </h1>

            <p className="mt-3 text-base leading-7 text-zinc-500">
              게시글 숨김/해제, 삭제, 댓글 모더레이션을 한 화면에서 처리할 수 있어요.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] bg-[linear-gradient(135deg,#7b7fff_0%,#57c7ff_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">전체 게시글</p>
              <p className="mt-3 text-4xl font-black">{totalCount}</p>
            </div>

            <div className="rounded-[24px] bg-[linear-gradient(135deg,#43c97b_0%,#7be3b0_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">노출 게시글</p>
              <p className="mt-3 text-4xl font-black">{visibleCount}</p>
            </div>

            <div className="rounded-[24px] bg-[linear-gradient(135deg,#ff8ca8_0%,#ffb199_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">숨김 게시글</p>
              <p className="mt-3 text-4xl font-black">{hiddenCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_18px_60px_rgba(17,24,39,0.06)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-2xl font-black text-zinc-900">검색 / 필터</h2>
            <p className="mt-2 text-base text-zinc-500">
              제목, 내용, 작성자, 카테고리로 게시글을 찾고 숨김 상태별로 필터링할 수 있어요.
            </p>
          </div>

          <button
            onClick={loadPosts}
            className="h-[52px] rounded-[18px] bg-zinc-900 px-6 text-sm font-bold text-white transition hover:opacity-90"
          >
            새로고침
          </button>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadPosts();
            }}
            className="h-[60px] w-full rounded-[18px] border border-zinc-200 bg-white px-5 text-[15px] outline-none transition focus:border-[#6c7cff]"
            placeholder="제목 / 내용 / 작성자 / 카테고리 검색"
          />

          <select
            value={hiddenFilter}
            onChange={(e) =>
              setHiddenFilter(e.target.value as "all" | "true" | "false")
            }
            className="h-[60px] rounded-[18px] border border-zinc-200 bg-white px-4 text-[15px] outline-none transition focus:border-[#6c7cff]"
          >
            <option value="all">전체</option>
            <option value="false">노출만</option>
            <option value="true">숨김만</option>
          </select>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={loadPosts}
              className="h-[60px] rounded-[18px] bg-[linear-gradient(135deg,#6c7cff_0%,#57c7ff_100%)] px-6 text-[15px] font-bold text-white shadow-lg transition hover:opacity-90"
            >
              검색
            </button>

            <button
              onClick={() => {
                setQ("");
                setHiddenFilter("all");
                clearSelectedPost();
                setNotice(null);
              }}
              className="h-[60px] rounded-[18px] bg-zinc-100 px-6 text-[15px] font-bold text-zinc-800 transition hover:bg-zinc-200"
            >
              초기화
            </button>
          </div>
        </div>

        {notice && (
          <div
            className={`mt-5 rounded-[18px] px-5 py-4 text-sm font-medium ${
              notice.type === "error"
                ? "border border-rose-200 bg-rose-50 text-rose-700"
                : "border border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>

      <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_18px_60px_rgba(17,24,39,0.06)]">
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-8 py-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-2xl font-black text-zinc-900">게시글 목록</h3>
            <p className="mt-2 text-sm text-zinc-500">
              현재 필터 기준으로 조회된 게시글이에요.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-zinc-100 px-3 py-2 text-zinc-700">
              필터:{" "}
              {hiddenFilter === "all"
                ? "전체"
                : hiddenFilter === "true"
                ? "숨김만"
                : "노출만"}
            </span>

            <span className="rounded-full bg-[#eef2ff] px-3 py-2 text-[#4d5cff]">
              결과 {posts.length}개
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1320px] w-full text-[15px]">
            <thead className="bg-[linear-gradient(90deg,#f7f8ff_0%,#fff7fb_55%,#f3fffb_100%)] text-left text-[#4f596a]">
              <tr>
                <th className="px-8 py-4 font-semibold">제목</th>
                <th className="px-8 py-4 font-semibold">카테고리</th>
                <th className="px-8 py-4 font-semibold">작성자</th>
                <th className="px-8 py-4 font-semibold">첨부</th>
                <th className="px-8 py-4 font-semibold">상태</th>
                <th className="px-8 py-4 font-semibold">작성일</th>
                <th className="px-8 py-4 font-semibold">관리</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {loadingPosts ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-8 py-5">
                      <div className="h-12 animate-pulse rounded-[14px] bg-zinc-100" />
                    </td>
                  </tr>
                ))
              ) : posts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-8 py-16 text-center text-base text-zinc-500"
                  >
                    조회된 게시글이 없습니다.
                  </td>
                </tr>
              ) : (
                posts.map((post) => {
                  const isBusy = busyPostId === post.id;
                  const isSelected = selectedPostId === post.id;

                  return (
                    <tr
                      key={post.id}
                      className={isSelected ? "bg-[#f7fbff]" : "hover:bg-zinc-50/70"}
                    >
                      <td className="px-8 py-5 align-top text-zinc-900">
                        <div className="max-w-[420px]">
                          <p className="line-clamp-1 text-[15px] font-bold">
                            {post.title || "(제목 없음)"}
                          </p>

                          <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-zinc-500">
                            {truncateText(post.content || "(내용 없음)", 120)}
                          </p>
                        </div>
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-600">
                        {post.category ?? "-"}
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-600">
                        {post.authorName ?? "-"}
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-600">
                        {post.attachmentsCount}
                      </td>

                      <td className="px-8 py-5 align-top">
                        {post.isHidden ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                            숨김
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                            노출
                          </span>
                        )}
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-600">
                        {formatDate(post.createdAt)}
                      </td>

                      <td className="px-8 py-5 align-top">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={async () => {
                              setSelectedPostId(post.id);
                              await loadComments(post.id);
                            }}
                            className={`h-[40px] rounded-[12px] px-4 text-sm font-bold transition ${
                              isSelected
                                ? "bg-[#003F8D] text-white"
                                : "bg-[#eef3fb] text-[#003F8D] hover:bg-[#e1ebfb]"
                            }`}
                          >
                            댓글 보기
                          </button>

                          {!post.isHidden ? (
                            <button
                              disabled={isBusy}
                              onClick={() => setPostHidden(post.id, true)}
                              className="h-[40px] rounded-[12px] bg-zinc-100 px-4 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
                            >
                              {isBusy ? "처리 중..." : "숨김"}
                            </button>
                          ) : (
                            <button
                              disabled={isBusy}
                              onClick={() => setPostHidden(post.id, false)}
                              className="h-[40px] rounded-[12px] bg-zinc-100 px-4 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
                            >
                              {isBusy ? "처리 중..." : "해제"}
                            </button>
                          )}

                          <button
                            disabled={isBusy}
                            onClick={() => deletePost(post.id)}
                            className="h-[40px] rounded-[12px] bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            {isBusy ? "처리 중..." : "삭제"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_18px_60px_rgba(17,24,39,0.06)]">
        <div className="flex flex-col gap-5 border-b border-zinc-100 px-8 py-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h3 className="text-2xl font-black text-zinc-900">댓글 관리</h3>

            <p className="mt-2 text-sm text-zinc-500">
              {selectedPost
                ? `선택된 게시글: ${selectedPost.title}`
                : "게시글 목록에서 '댓글 보기'를 눌러 댓글을 불러오세요."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedPostId && (
              <>
                <span className="rounded-full bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-700">
                  전체 댓글 {comments.length}개
                </span>

                <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                  노출 {visibleCommentsCount}개
                </span>

                <span className="rounded-full bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  숨김 {hiddenCommentsCount}개
                </span>

                <button
                  onClick={() => selectedPostId && loadComments(selectedPostId)}
                  className="rounded-[12px] bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-800 transition hover:bg-zinc-200"
                >
                  댓글 새로고침
                </button>

                <button
                  onClick={clearSelectedPost}
                  className="rounded-[12px] bg-zinc-900 px-4 py-2 text-xs font-bold text-white transition hover:opacity-90"
                >
                  선택 해제
                </button>
              </>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1220px] w-full text-[15px]">
            <thead className="bg-[linear-gradient(90deg,#f7f8ff_0%,#fff7fb_55%,#f3fffb_100%)] text-left text-[#4f596a]">
              <tr>
                <th className="px-8 py-4 font-semibold">구분</th>
                <th className="px-8 py-4 font-semibold">작성자</th>
                <th className="px-8 py-4 font-semibold">내용</th>
                <th className="px-8 py-4 font-semibold">상태</th>
                <th className="px-8 py-4 font-semibold">작성일</th>
                <th className="px-8 py-4 font-semibold">관리</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {!selectedPostId ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-8 py-16 text-center text-base text-zinc-500"
                  >
                    댓글을 볼 게시글을 먼저 선택해 주세요.
                  </td>
                </tr>
              ) : loadingComments ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-8 py-5">
                      <div className="h-12 animate-pulse rounded-[14px] bg-zinc-100" />
                    </td>
                  </tr>
                ))
              ) : threadedComments.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-8 py-16 text-center text-base text-zinc-500"
                  >
                    댓글이 없습니다.
                  </td>
                </tr>
              ) : (
                threadedComments.map((comment) => {
                  const isBusy = busyCommentId === comment.id;

                  return (
                    <tr key={comment.id} className="hover:bg-zinc-50/70">
                      <td className="px-8 py-5 align-top text-zinc-600">
                        {comment.parentId ? (
                          <span className="inline-flex rounded-full bg-[#eef3fb] px-3 py-1 text-xs font-bold text-[#003F8D]">
                            대댓글
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">
                            댓글
                          </span>
                        )}
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-600">
                        {comment.authorName ?? "-"}
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-900">
                        <div
                          className="max-w-[560px] whitespace-pre-wrap break-words rounded-[16px] bg-zinc-50 px-4 py-3"
                          style={{ marginLeft: `${comment.depth * 20}px` }}
                        >
                          <p className="text-[13px] font-semibold text-zinc-400">
                            {comment.depth > 0 ? `답글 레벨 ${comment.depth}` : "원댓글"}
                          </p>

                          <p className="mt-2 leading-6">
                            {comment.content || "(내용 없음)"}
                          </p>
                        </div>
                      </td>

                      <td className="px-8 py-5 align-top">
                        {comment.isHidden ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700">
                            숨김
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                            노출
                          </span>
                        )}
                      </td>

                      <td className="px-8 py-5 align-top text-zinc-600">
                        {formatDate(comment.createdAt)}
                      </td>

                      <td className="px-8 py-5 align-top">
                        <div className="flex flex-wrap gap-2">
                          {!comment.isHidden ? (
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                setCommentHidden(comment.postId, comment.id, true)
                              }
                              className="h-[40px] rounded-[12px] bg-zinc-100 px-4 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
                            >
                              {isBusy ? "처리 중..." : "숨김"}
                            </button>
                          ) : (
                            <button
                              disabled={isBusy}
                              onClick={() =>
                                setCommentHidden(comment.postId, comment.id, false)
                              }
                              className="h-[40px] rounded-[12px] bg-zinc-100 px-4 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
                            >
                              {isBusy ? "처리 중..." : "해제"}
                            </button>
                          )}

                          <button
                            disabled={isBusy}
                            onClick={() => deleteComment(comment.postId, comment.id)}
                            className="h-[40px] rounded-[12px] bg-rose-50 px-4 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            {isBusy ? "처리 중..." : "삭제"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}