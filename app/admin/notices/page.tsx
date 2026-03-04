"use client";

// app/admin/notices/page.tsx

// 관리자 공지사항 관리 페이지
// - 공지 목록 조회
// - 공지 생성 / 수정 / 삭제
// - 활성화 여부 / 팝업 여부 / 우선순위 / 노출 시작일 / 종료일 관리
// - 메인 홈에서 바로 뜨는 팝업형 공지를 만들 수 있도록 구성
// - datetime-local 입력값은 브라우저 로컬 시간 문자열이므로
//   서버로 보낼 때 ISO 문자열로 변환해서 타임존 꼬임을 방지함

import { useCallback, useEffect, useMemo, useState } from "react";
// React 훅들
// - useState: 폼 / 목록 / 로딩 / 알림 / 수정모드 상태 관리
// - useEffect: 최초 진입 시 공지 목록 자동 조회
// - useCallback: API 호출 함수 재생성 최소화
// - useMemo: 요약 수치 계산 최적화

import { auth } from "@/lib/firebase.client";
// 현재 로그인한 관리자 계정의 Firebase ID Token을 가져오기 위해 사용
// 관리자 API 호출 시 Authorization 헤더에 Bearer 토큰으로 전달

type AdminNoticeRow = {
  id: string;
  // 공지 문서 id

  title: string;
  // 공지 제목

  content: string;
  // 공지 본문

  isActive: boolean;
  // 현재 활성화 여부

  isPopup: boolean;
  // 팝업 공지 여부

  priority: number;
  // 우선순위
  // 숫자가 작을수록 먼저 노출

  startsAt: string | null;
  // 노출 시작일 ISO 문자열

  endsAt: string | null;
  // 노출 종료일 ISO 문자열

  createdAt: string | null;
  // 생성일 ISO 문자열

  updatedAt: string | null;
  // 수정일 ISO 문자열
};

type NoticeFormState = {
  title: string;
  content: string;
  isActive: boolean;
  isPopup: boolean;
  priority: number;
  startsAt: string;
  endsAt: string;
};

type NoticeMessage = {
  type: "success" | "error";
  text: string;
};

const initialForm: NoticeFormState = {
  title: "",
  content: "",
  isActive: true,
  isPopup: true,
  priority: 0,
  startsAt: "",
  endsAt: "",
};
// 공지 작성 기본값
// - 기본적으로 활성화 + 팝업 공지 상태로 시작

async function getIdTokenOrThrow() {
  // 현재 로그인한 관리자 계정의 Firebase ID Token을 가져오는 함수

  const user = auth.currentUser;
  // 현재 로그인한 관리자 유저 정보 읽기

  if (!user) {
    throw new Error("NO_LOGIN");
  }
  // 로그인 정보가 없으면 예외 처리

  return await user.getIdToken();
  // Firebase ID Token 반환
}

function formatDate(value: string | null) {
  // ISO 문자열을 한국식 보기 좋은 날짜 포맷으로 바꾸는 함수

  if (!value) return "-";
  // 값이 없으면 하이픈 표시

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }
  // 변환 실패 시 원본 문자열 반환

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  // 한국 시간 포맷으로 반환
}

function toInputDateTime(value: string | null) {
  // ISO 문자열을 datetime-local input 값 형태로 바꾸는 함수
  // 예: 2026-03-04T15:30
  // 저장은 ISO로 되어 있어도, 입력창에는 로컬 시간으로 다시 보여줘야 함

  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function toIsoFromDateTimeLocal(value: string) {
  // datetime-local input 값(타임존 없는 로컬 문자열)을
  // 브라우저에서 정확한 ISO 문자열로 바꾸는 함수
  //
  // 예:
  // "2026-03-04T15:30"
  // -> 브라우저 로컬 시간 기준 Date 생성
  // -> "2026-03-04T06:30:00.000Z" 같은 ISO 문자열 반환
  //
  // 이렇게 해야 서버 시간대와 상관없이 사용자가 고른 시각이 정확히 저장됨

  const trimmed = value.trim();

  if (!trimmed) return null;
  // 비어 있으면 null 반환
  // 시작일/종료일 미설정 상태를 의미

  const date = new Date(trimmed);
  // 브라우저 로컬 시간 기준 Date 객체 생성

  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // 잘못된 값이면 null 처리

  return date.toISOString();
  // 서버로 보낼 ISO 문자열 반환
}

function setNowDateTimeLocal() {
  // "지금" 버튼처럼 쓸 수 있는 현재 시각 datetime-local 문자열 생성 함수
  // 초는 버리고 분까지만 사용

  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function truncateText(value: string, max = 120) {
  // 공지 본문을 목록에서 너무 길지 않게 잘라주는 함수

  if (!value) return "";

  if (value.length <= max) return value;

  return `${value.slice(0, max)}...`;
}

function getStatusLabel(item: AdminNoticeRow) {
  // 공지의 현재 상태를 사용자 친화적인 텍스트로 표시하는 함수

  if (!item.isActive) return "비활성";

  const now = Date.now();
  // 현재 시각

  const startsAt = item.startsAt ? new Date(item.startsAt).getTime() : null;
  const endsAt = item.endsAt ? new Date(item.endsAt).getTime() : null;

  if (startsAt && now < startsAt) {
    return "예정";
  }
  // 시작일 전이면 예정 상태

  if (endsAt && now > endsAt) {
    return "종료";
  }
  // 종료일이 지났으면 종료 상태

  return "노출 중";
  // 그 외에는 실제 노출 중
}

export default function AdminNoticesPage() {
  const [items, setItems] = useState<AdminNoticeRow[]>([]);
  // 공지 목록 상태

  const [form, setForm] = useState<NoticeFormState>(initialForm);
  // 공지 작성 / 수정 폼 상태

  const [editingId, setEditingId] = useState<string | null>(null);
  // 현재 수정 중인 공지 id
  // null이면 새 공지 작성 모드

  const [loading, setLoading] = useState(true);
  // 목록 로딩 상태

  const [saving, setSaving] = useState(false);
  // 저장(생성/수정) 처리 중 상태

  const [busyId, setBusyId] = useState<string | null>(null);
  // 삭제 등 개별 공지 처리 중 id

  const [message, setMessage] = useState<NoticeMessage | null>(null);
  // 화면 상단 알림 메시지 상태

  const loadNotices = useCallback(async () => {
    // 공지 목록을 서버에서 불러오는 함수

    setMessage(null);
    // 이전 메시지 초기화

    setLoading(true);
    // 로딩 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch("/api/admin/notices", {
        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 인증 토큰 전달
        },
        cache: "no-store",
        // 공지 상태를 항상 최신으로 보기 위해 캐시 비활성화
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setMessage({
          type: "error",
          text: data?.error ?? "공지 목록 조회 실패",
        });
        return;
      }

      setItems(data.notices ?? []);
      // 공지 목록 상태 반영
    } catch {
      setMessage({
        type: "error",
        text: "공지 목록 조회 실패",
      });
    } finally {
      setLoading(false);
      // 로딩 종료
    }
  }, []);

  useEffect(() => {
    loadNotices();
    // 최초 진입 시 공지 목록 자동 조회
  }, [loadNotices]);

  const resetForm = () => {
    // 폼을 초기 상태로 되돌리는 함수

    setForm(initialForm);
    // 작성 기본값으로 초기화

    setEditingId(null);
    // 수정 모드 해제

    setMessage(null);
    // 메시지 초기화
  };

  const startEdit = (item: AdminNoticeRow) => {
    // 특정 공지를 수정 모드로 전환하는 함수

    setEditingId(item.id);
    // 수정 중인 공지 id 저장

    setForm({
      title: item.title,
      content: item.content,
      isActive: item.isActive,
      isPopup: item.isPopup,
      priority: item.priority,
      startsAt: toInputDateTime(item.startsAt),
      endsAt: toInputDateTime(item.endsAt),
    });
    // 선택한 공지 데이터를 폼에 채움

    setMessage(null);
    // 이전 메시지 초기화
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 폼 기본 새로고침 방지

    setMessage(null);
    // 이전 메시지 초기화

    if (!form.title.trim() || !form.content.trim()) {
      setMessage({
        type: "error",
        text: "제목과 내용을 입력해 주세요.",
      });
      return;
    }
    // 제목/내용 필수 입력 검증

    setSaving(true);
    // 저장 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const isEditMode = Boolean(editingId);
      // 수정 모드 여부 판별

      const url = isEditMode
        ? `/api/admin/notices/${editingId}`
        : "/api/admin/notices";
      // 생성/수정에 따라 API URL 선택

      const method = isEditMode ? "PATCH" : "POST";
      // 생성/수정에 따라 HTTP method 선택

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title.trim(),
          content: form.content.trim(),
          isActive: form.isActive,
          isPopup: form.isPopup,
          priority: Number(form.priority),

          startsAt: toIsoFromDateTimeLocal(form.startsAt),
          // 핵심 수정
          // datetime-local 값을 브라우저에서 ISO 문자열로 변환해서 전송
          // 서버가 자기 마음대로 시간대를 해석하지 못하게 막음

          endsAt: toIsoFromDateTimeLocal(form.endsAt),
          // 종료일도 동일하게 ISO 문자열로 변환
        }),
      });
      // 공지 생성/수정 요청 전송

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setMessage({
          type: "error",
          text: data?.error ?? "공지 저장 실패",
        });
        return;
      }

      await loadNotices();
      // 저장 후 목록 재조회

      setMessage({
        type: "success",
        text: isEditMode
          ? "공지사항을 수정했어요."
          : "공지사항을 생성했어요.",
      });

      resetForm();
      // 폼 초기화
    } catch {
      setMessage({
        type: "error",
        text: "공지 저장 실패",
      });
    } finally {
      setSaving(false);
      // 저장 종료
    }
  };

  const deleteNotice = async (noticeId: string) => {
    // 특정 공지를 삭제하는 함수

    const ok = confirm("정말 이 공지사항을 삭제하시겠습니까?");

    if (!ok) return;

    setMessage(null);
    setBusyId(noticeId);

    try {
      const token = await getIdTokenOrThrow();

      const res = await fetch(`/api/admin/notices/${noticeId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage({
          type: "error",
          text: data?.error ?? "공지 삭제 실패",
        });
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== noticeId));

      if (editingId === noticeId) {
        resetForm();
      }

      setMessage({
        type: "success",
        text: "공지사항을 삭제했어요.",
      });
    } catch {
      setMessage({
        type: "error",
        text: "공지 삭제 실패",
      });
    } finally {
      setBusyId(null);
    }
  };

  const totalCount = useMemo(() => items.length, [items]);
  const activeCount = useMemo(
    () => items.filter((item) => item.isActive).length,
    [items]
  );
  const popupCount = useMemo(
    () => items.filter((item) => item.isPopup).length,
    [items]
  );

  return (
    <section className="space-y-8">
      <div className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(17,24,39,0.08)]">
        <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6c7cff]">
              Notices
            </p>

            <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900">
              공지사항 관리
            </h1>

            <p className="mt-3 text-base leading-7 text-zinc-500">
              메인 홈 팝업으로 노출될 공지를 관리할 수 있어요.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] bg-[linear-gradient(135deg,#7b7fff_0%,#57c7ff_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">전체 공지</p>
              <p className="mt-3 text-4xl font-black">{totalCount}</p>
            </div>

            <div className="rounded-[24px] bg-[linear-gradient(135deg,#43c97b_0%,#7be3b0_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">활성 공지</p>
              <p className="mt-3 text-4xl font-black">{activeCount}</p>
            </div>

            <div className="rounded-[24px] bg-[linear-gradient(135deg,#ff8ca8_0%,#ffb199_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">팝업 공지</p>
              <p className="mt-3 text-4xl font-black">{popupCount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 2xl:grid-cols-[520px_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-white/70 bg-white/90 p-8 shadow-[0_18px_60px_rgba(17,24,39,0.06)]">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black text-zinc-900">
                {editingId ? "공지 수정" : "공지 등록"}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                시작일을 비워두면 즉시 노출돼요.
              </p>
            </div>

            {editingId && (
              <button
                onClick={resetForm}
                className="rounded-[14px] bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200"
              >
                새 공지로 전환
              </button>
            )}
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-700">
                제목
              </label>

              <input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                className="h-[54px] w-full rounded-[16px] border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-[#6c7cff]"
                placeholder="공지 제목을 입력하세요"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-700">
                내용
              </label>

              <textarea
                value={form.content}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, content: e.target.value }))
                }
                rows={8}
                className="w-full rounded-[16px] border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#6c7cff]"
                placeholder="팝업 본문 내용을 입력하세요"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-[16px] border border-zinc-200 px-4 py-4">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isActive: e.target.checked }))
                  }
                />
                <span className="text-sm font-medium text-zinc-700">
                  활성 공지
                </span>
              </label>

              <label className="flex items-center gap-3 rounded-[16px] border border-zinc-200 px-4 py-4">
                <input
                  type="checkbox"
                  checked={form.isPopup}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, isPopup: e.target.checked }))
                  }
                />
                <span className="text-sm font-medium text-zinc-700">
                  팝업 공지
                </span>
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-zinc-700">
                우선순위
              </label>

              <input
                type="number"
                value={form.priority}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priority: Number(e.target.value),
                  }))
                }
                className="h-[54px] w-full rounded-[16px] border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-[#6c7cff]"
                placeholder="0"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-bold text-zinc-700">
                    노출 시작일
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        startsAt: setNowDateTimeLocal(),
                      }))
                    }
                    className="rounded-[10px] bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 transition hover:bg-zinc-200"
                  >
                    지금
                  </button>
                </div>

                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, startsAt: e.target.value }))
                  }
                  className="h-[54px] w-full rounded-[16px] border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-[#6c7cff]"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-sm font-bold text-zinc-700">
                    노출 종료일
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        endsAt: "",
                      }))
                    }
                    className="rounded-[10px] bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 transition hover:bg-zinc-200"
                  >
                    비우기
                  </button>
                </div>

                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, endsAt: e.target.value }))
                  }
                  className="h-[54px] w-full rounded-[16px] border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-[#6c7cff]"
                />
              </div>
            </div>

            {message && (
              <div
                className={`rounded-[16px] px-4 py-3 text-sm font-medium ${
                  message.type === "error"
                    ? "border border-rose-200 bg-rose-50 text-rose-700"
                    : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {message.text}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={saving}
                className="h-[54px] rounded-[16px] bg-[linear-gradient(135deg,#6c7cff_0%,#57c7ff_100%)] px-6 text-sm font-bold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
              >
                {saving
                  ? editingId
                    ? "수정 중..."
                    : "등록 중..."
                  : editingId
                  ? "공지 수정"
                  : "공지 등록"}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="h-[54px] rounded-[16px] bg-zinc-100 px-6 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200"
              >
                초기화
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_18px_60px_rgba(17,24,39,0.06)]">
          <div className="flex flex-col gap-4 border-b border-zinc-100 px-8 py-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-2xl font-black text-zinc-900">공지 목록</h2>
              <p className="mt-2 text-sm text-zinc-500">
                메인 홈 팝업으로 노출될 공지들을 확인하고 수정할 수 있어요.
              </p>
            </div>

            <button
              onClick={loadNotices}
              className="h-[48px] rounded-[14px] bg-zinc-900 px-5 text-sm font-bold text-white transition hover:opacity-90"
            >
              새로고침
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-[15px]">
              <thead className="bg-[linear-gradient(90deg,#f7f8ff_0%,#fff7fb_55%,#f3fffb_100%)] text-left text-[#4f596a]">
                <tr>
                  <th className="px-8 py-4 font-semibold">제목</th>
                  <th className="px-8 py-4 font-semibold">본문</th>
                  <th className="px-8 py-4 font-semibold">상태</th>
                  <th className="px-8 py-4 font-semibold">팝업</th>
                  <th className="px-8 py-4 font-semibold">우선순위</th>
                  <th className="px-8 py-4 font-semibold">노출 기간</th>
                  <th className="px-8 py-4 font-semibold">수정일</th>
                  <th className="px-8 py-4 font-semibold">관리</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-8 py-5">
                        <div className="h-12 animate-pulse rounded-[14px] bg-zinc-100" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-8 py-16 text-center text-base text-zinc-500"
                    >
                      등록된 공지가 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isBusy = busyId === item.id;
                    const statusLabel = getStatusLabel(item);

                    return (
                      <tr key={item.id} className="hover:bg-zinc-50/70">
                        <td className="px-8 py-5 align-top">
                          <div className="max-w-[240px]">
                            <p className="font-bold text-zinc-900">
                              {item.title}
                            </p>
                          </div>
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          <div className="max-w-[360px] whitespace-pre-wrap break-words leading-6">
                            {truncateText(item.content, 140)}
                          </div>
                        </td>

                        <td className="px-8 py-5 align-top">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                              statusLabel === "노출 중"
                                ? "bg-emerald-100 text-emerald-700"
                                : statusLabel === "비활성"
                                ? "bg-zinc-100 text-zinc-700"
                                : statusLabel === "예정"
                                ? "bg-sky-100 text-sky-700"
                                : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </td>

                        <td className="px-8 py-5 align-top">
                          {item.isPopup ? (
                            <span className="inline-flex rounded-full bg-[#eef2ff] px-3 py-1 text-xs font-bold text-[#4d5cff]">
                              팝업
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">
                              일반
                            </span>
                          )}
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          {item.priority}
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          <div className="min-w-[220px] space-y-1 text-sm">
                            <p>시작: {formatDate(item.startsAt)}</p>
                            <p>종료: {formatDate(item.endsAt)}</p>
                          </div>
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          {formatDate(item.updatedAt)}
                        </td>

                        <td className="px-8 py-5 align-top">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => startEdit(item)}
                              className="h-[40px] rounded-[12px] bg-[#eef3fb] px-4 text-sm font-bold text-[#003F8D] transition hover:bg-[#e1ebfb]"
                            >
                              수정
                            </button>

                            <button
                              disabled={isBusy}
                              onClick={() => deleteNotice(item.id)}
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
      </div>
    </section>
  );
}