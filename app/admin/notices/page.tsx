"use client";

// app/admin/notices/page.tsx

// 관리자 공지 팝업 관리 페이지
// - 공지 목록 조회
// - 공지 생성 / 수정 / 삭제
// - 메인 진입 팝업으로 쓸지(showPopup)만 관리
// - 노출 시작일 / 종료일 설정 가능
// - 예전 isActive / isPopup 개념은 제거하고 showPopup 하나만 사용

import { useCallback, useEffect, useMemo, useState } from "react";
// React 훅들
// - useState: 폼 / 목록 / 로딩 / 알림 / 수정모드 상태 관리
// - useEffect: 최초 진입 시 공지 목록 조회
// - useCallback: API 함수 메모이제이션
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

  showPopup: boolean;
  // 메인 진입 팝업으로 보여줄지 여부

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
  showPopup: boolean;
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
  showPopup: true,
  startsAt: "",
  endsAt: "",
};
// 공지 작성 기본값
// - 기본적으로 팝업 켜짐 상태로 시작

async function getIdTokenOrThrow() {
  // 현재 로그인한 관리자 계정의 Firebase ID Token을 가져오는 함수

  const user = auth.currentUser;
  // 현재 로그인한 사용자 정보 읽기

  if (!user) {
    throw new Error("NO_LOGIN");
  }
  // 로그인 정보가 없으면 예외 처리

  return await user.getIdToken();
  // Firebase ID Token 반환
}

function formatDate(value: string | null) {
  // ISO 문자열을 화면용 날짜 문자열로 바꾸는 함수

  if (!value) return "-";
  // 값이 없으면 하이픈 표시

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }
  // Date 변환 실패 시 원본 문자열 반환

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  // 한국식 날짜 포맷 반환
}

function toInputDateTime(value: string | null) {
  // ISO 문자열을 datetime-local input 값으로 바꾸는 함수
  // 예: 2026-03-04T14:30

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

function truncateText(value: string, max = 120) {
  // 목록에서 본문이 너무 길면 잘라주는 함수

  if (!value) return "";

  if (value.length <= max) return value;

  return `${value.slice(0, max)}...`;
}

function getStatusLabel(item: AdminNoticeRow) {
  // 공지의 현재 노출 상태를 사람이 읽기 쉬운 텍스트로 반환

  if (!item.showPopup) {
    return "팝업 꺼짐";
  }
  // 팝업 자체가 꺼져 있으면 바로 종료

  const now = Date.now();
  // 현재 시각

  const startsAtMs = item.startsAt ? new Date(item.startsAt).getTime() : 0;
  const endsAtMs = item.endsAt ? new Date(item.endsAt).getTime() : 0;

  if (startsAtMs && now < startsAtMs) {
    return "예정";
  }
  // 시작일 전이면 예정

  if (endsAtMs && now > endsAtMs) {
    return "종료";
  }
  // 종료일이 지났으면 종료

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
  // 저장 처리 중 상태

  const [busyId, setBusyId] = useState<string | null>(null);
  // 삭제 처리 중인 공지 id

  const [message, setMessage] = useState<NoticeMessage | null>(null);
  // 화면 상단 알림 메시지

  const loadNotices = useCallback(async () => {
    // 공지 목록을 서버에서 불러오는 함수

    setLoading(true);
    // 로딩 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch("/api/admin/notices", {
        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 토큰 전달
        },
        cache: "no-store",
        // 항상 최신 데이터 조회
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
      // 목록 상태 반영
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

  const resetForm = (clearMessage = true) => {
    // 공지 작성 폼을 초기 상태로 되돌리는 함수

    setForm(initialForm);
    // 입력값 초기화

    setEditingId(null);
    // 수정 모드 해제

    if (clearMessage) {
      setMessage(null);
    }
    // 필요할 때만 메시지 초기화
  };

  const startEdit = (item: AdminNoticeRow) => {
    // 특정 공지를 수정 모드로 전환하는 함수

    setEditingId(item.id);
    // 수정 중인 공지 id 저장

    setForm({
      title: item.title,
      content: item.content,
      showPopup: item.showPopup,
      startsAt: toInputDateTime(item.startsAt),
      endsAt: toInputDateTime(item.endsAt),
    });
    // 폼에 기존 값 채우기

    setMessage(null);
    // 이전 메시지 초기화
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // form 기본 새로고침 방지

    setMessage(null);
    // 이전 메시지 초기화

    if (!form.title.trim() || !form.content.trim()) {
      setMessage({
        type: "error",
        text: "제목과 내용을 입력해 주세요.",
      });
      return;
    }
    // 제목 / 내용 필수 입력 검사

    setSaving(true);
    // 저장 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const isEditMode = Boolean(editingId);
      // 수정 모드 여부 판단

      const url = isEditMode
        ? `/api/admin/notices/${editingId}`
        : "/api/admin/notices";
      // 생성/수정에 따라 URL 선택

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
          showPopup: form.showPopup,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
        }),
      });
      // 공지 생성/수정 요청

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

      resetForm(false);
      // 성공 메시지는 유지해야 하므로 clearMessage=false

      setMessage({
        type: "success",
        text: isEditMode
          ? "공지 팝업을 수정했어요."
          : "공지 팝업을 저장했어요.",
      });
      // 성공 메시지 표시
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
    // 사용자 확인

    if (!ok) return;
    // 취소 시 중단

    setMessage(null);
    // 이전 메시지 초기화

    setBusyId(noticeId);
    // 현재 처리 중인 공지 id 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const res = await fetch(`/api/admin/notices/${noticeId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      // 삭제 요청

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setMessage({
          type: "error",
          text: data?.error ?? "공지 삭제 실패",
        });
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== noticeId));
      // 화면 목록에서 제거

      if (editingId === noticeId) {
        resetForm();
      }
      // 수정 중인 공지를 삭제했으면 폼 초기화

      setMessage({
        type: "success",
        text: "공지 팝업을 삭제했어요.",
      });
    } catch {
      setMessage({
        type: "error",
        text: "공지 삭제 실패",
      });
    } finally {
      setBusyId(null);
      // busy 상태 해제
    }
  };

  const totalCount = useMemo(() => items.length, [items]);
  // 전체 공지 수

  const popupEnabledCount = useMemo(
    () => items.filter((item) => item.showPopup).length,
    [items]
  );
  // 팝업 켜짐 수

  const showingNowCount = useMemo(() => {
    const now = Date.now();

    return items.filter((item) => {
      if (!item.showPopup) return false;

      const startsAtMs = item.startsAt ? new Date(item.startsAt).getTime() : 0;
      const endsAtMs = item.endsAt ? new Date(item.endsAt).getTime() : 0;

      if (startsAtMs && now < startsAtMs) return false;
      if (endsAtMs && now > endsAtMs) return false;

      return true;
    }).length;
  }, [items]);
  // 지금 시점 기준 실제 노출 가능한 공지 수

  return (
    <section className="space-y-8">
      <div className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_25px_80px_rgba(17,24,39,0.08)]">
        <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6c7cff]">
              Popup Notice
            </p>

            <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900">
              공지 팝업 관리
            </h1>

            <p className="mt-3 text-base leading-7 text-zinc-500">
              메인에 뜨는 팝업 공지 관리해요.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] bg-[linear-gradient(135deg,#7b7fff_0%,#57c7ff_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">전체 공지</p>
              <p className="mt-3 text-4xl font-black">{totalCount}</p>
            </div>

            <div className="rounded-[24px] bg-[linear-gradient(135deg,#43c97b_0%,#7be3b0_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">팝업 켜짐</p>
              <p className="mt-3 text-4xl font-black">{popupEnabledCount}</p>
            </div>

            <div className="rounded-[24px] bg-[linear-gradient(135deg,#ff8ca8_0%,#ffb199_100%)] px-6 py-5 text-white shadow-lg">
              <p className="text-sm font-semibold text-white/90">지금 노출 가능</p>
              <p className="mt-3 text-4xl font-black">{showingNowCount}</p>
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
                제목, 내용, 팝업 노출 여부, 노출 기간 설정하면 돼요.
              </p>
            </div>

            
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
                placeholder="팝업 공지 내용을 입력하세요"
              />
            </div>

            <label className="flex items-center gap-3 rounded-[16px] border border-zinc-200 px-4 py-4">
              <input
                type="checkbox"
                checked={form.showPopup}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, showPopup: e.target.checked }))
                }
              />
              <span className="text-sm font-medium text-zinc-700">
                메인 진입 팝업으로 노출
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-zinc-700">
                  노출 시작일
                </label>

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
                <label className="mb-2 block text-sm font-bold text-zinc-700">
                  노출 종료일
                </label>

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
                onClick={() => resetForm()}
                className="h-[54px] rounded-[16px] bg-zinc-100 px-6 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200"
              >
                초기화
              </button>

              {editingId && (
              <button
                onClick={() => resetForm()}
                className="rounded-[14px] bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200"
              >
                새 공지로 전환
              </button>
            )}
            </div>
          </form>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/90 shadow-[0_18px_60px_rgba(17,24,39,0.06)]">
          <div className="flex flex-col gap-4 border-b border-zinc-100 px-8 py-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-2xl font-black text-zinc-900">공지 목록</h2>
              <p className="mt-2 text-sm text-zinc-500">
                메인 팝업으로 쓸 공지를 확인하고 수정할 수 있어요.
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
            <table className="min-w-[1100px] w-full text-[15px]">
              <thead className="bg-[linear-gradient(90deg,#f7f8ff_0%,#fff7fb_55%,#f3fffb_100%)] text-left text-[#4f596a]">
                <tr>
                  <th className="px-8 py-4 font-semibold">제목</th>
                  <th className="px-8 py-4 font-semibold">본문</th>
                  <th className="px-8 py-4 font-semibold">상태</th>
                  <th className="px-8 py-4 font-semibold">노출 시작</th>
                  <th className="px-8 py-4 font-semibold">노출 종료</th>
                  <th className="px-8 py-4 font-semibold">수정일</th>
                  <th className="px-8 py-4 font-semibold">관리</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-zinc-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-8 py-5">
                        <div className="h-12 animate-pulse rounded-[14px] bg-zinc-100" />
                      </td>
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
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
                          <div className="max-w-[220px]">
                            <p className="font-bold text-zinc-900">
                              {item.title}
                            </p>
                          </div>
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          <div className="max-w-[340px] whitespace-pre-wrap break-words leading-6">
                            {truncateText(item.content, 130)}
                          </div>
                        </td>

                        <td className="px-8 py-5 align-top">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                              statusLabel === "노출 중"
                                ? "bg-emerald-100 text-emerald-700"
                                : statusLabel === "예정"
                                ? "bg-sky-100 text-sky-700"
                                : statusLabel === "종료"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          {formatDate(item.startsAt)}
                        </td>

                        <td className="px-8 py-5 align-top text-zinc-600">
                          {formatDate(item.endsAt)}
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