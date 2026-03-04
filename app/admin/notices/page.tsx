"use client";

// app/admin/notices/page.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/lib/firebase.client";

type AdminNoticeRow = {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  isPopup: boolean;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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

async function getIdTokenOrThrow() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("NO_LOGIN");
  }

  return await user.getIdToken();
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function toInputDateTime(value: string | null) {
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

function setNowDateTimeLocal() {
  const now = new Date();
  now.setSeconds(0, 0);

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseDateTimeLocal(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
  );

  if (!match) return null;

  const [, y, m, d, hh, mi] = match;

  const year = Number(y);
  const monthIndex = Number(m) - 1;
  const day = Number(d);
  const hour = Number(hh);
  const minute = Number(mi);

  const date = new Date(year, monthIndex, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== monthIndex ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
}

function truncateText(value: string, max = 120) {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function getStatusLabel(item: AdminNoticeRow) {
  if (!item.isActive) return "비활성";

  const now = Date.now();
  const startsAt = item.startsAt ? new Date(item.startsAt).getTime() : null;
  const endsAt = item.endsAt ? new Date(item.endsAt).getTime() : null;

  if (startsAt !== null && now < startsAt) {
    return "예정";
  }

  if (endsAt !== null && now > endsAt) {
    return "종료";
  }

  return "노출 중";
}

export default function AdminNoticesPage() {
  const [items, setItems] = useState<AdminNoticeRow[]>([]);
  const [form, setForm] = useState<NoticeFormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<NoticeMessage | null>(null);

  const loadNotices = useCallback(async () => {
    setMessage(null);
    setLoading(true);

    try {
      const token = await getIdTokenOrThrow();

      const res = await fetch("/api/admin/notices", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage({
          type: "error",
          text: data?.error ?? "공지 목록 조회 실패",
        });
        return;
      }

      setItems(data.notices ?? []);
    } catch {
      setMessage({
        type: "error",
        text: "공지 목록 조회 실패",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotices();
  }, [loadNotices]);

  const resetForm = (options?: { keepMessage?: boolean }) => {
    setForm(initialForm);
    setEditingId(null);

    if (!options?.keepMessage) {
      setMessage(null);
    }
  };

  const startEdit = (item: AdminNoticeRow) => {
    setEditingId(item.id);

    setForm({
      title: item.title,
      content: item.content,
      isActive: item.isActive,
      isPopup: item.isPopup,
      priority: item.priority,
      startsAt: toInputDateTime(item.startsAt),
      endsAt: toInputDateTime(item.endsAt),
    });

    setMessage(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!form.title.trim() || !form.content.trim()) {
      setMessage({
        type: "error",
        text: "제목과 내용을 입력해 주세요.",
      });
      return;
    }

    const parsedStartsAt = form.startsAt.trim()
      ? parseDateTimeLocal(form.startsAt)
      : null;

    const parsedEndsAt = form.endsAt.trim()
      ? parseDateTimeLocal(form.endsAt)
      : null;

    if (form.startsAt.trim() && !parsedStartsAt) {
      setMessage({
        type: "error",
        text: "노출 시작일 형식이 올바르지 않습니다.",
      });
      return;
    }

    if (form.endsAt.trim() && !parsedEndsAt) {
      setMessage({
        type: "error",
        text: "노출 종료일 형식이 올바르지 않습니다.",
      });
      return;
    }

    if (
      parsedStartsAt &&
      parsedEndsAt &&
      parsedEndsAt.getTime() <= parsedStartsAt.getTime()
    ) {
      setMessage({
        type: "error",
        text: "노출 종료일은 시작일보다 뒤여야 합니다.",
      });
      return;
    }

    setSaving(true);

    try {
      const token = await getIdTokenOrThrow();
      const isEditMode = Boolean(editingId);

      const url = isEditMode
        ? `/api/admin/notices/${editingId}`
        : "/api/admin/notices";

      const method = isEditMode ? "PATCH" : "POST";

      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        isActive: form.isActive,
        isPopup: form.isPopup,
        priority: Number.isFinite(Number(form.priority))
          ? Number(form.priority)
          : 0,
        startsAt: parsedStartsAt ? parsedStartsAt.toISOString() : null,
        endsAt: parsedEndsAt ? parsedEndsAt.toISOString() : null,
      };

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage({
          type: "error",
          text: data?.error ?? "공지 저장 실패",
        });
        return;
      }

      await loadNotices();

      resetForm({ keepMessage: true });

      setMessage({
        type: "success",
        text: isEditMode
          ? "공지사항을 수정했어요."
          : "공지사항을 생성했어요.",
      });
    } catch {
      setMessage({
        type: "error",
        text: "공지 저장 실패",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteNotice = async (noticeId: string) => {
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
        resetForm({ keepMessage: true });
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
                type="button"
                onClick={() => resetForm()}
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
                    priority:
                      e.target.value === "" ? 0 : Number(e.target.value),
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
                  step={60}
                  value={form.startsAt}
                  max={form.endsAt || undefined}
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
                  step={60}
                  value={form.endsAt}
                  min={form.startsAt || undefined}
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
              type="button"
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
                              type="button"
                              onClick={() => startEdit(item)}
                              className="h-[40px] rounded-[12px] bg-[#eef3fb] px-4 text-sm font-bold text-[#003F8D] transition hover:bg-[#e1ebfb]"
                            >
                              수정
                            </button>

                            <button
                              type="button"
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