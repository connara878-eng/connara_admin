"use client";

// app/admin/users/page.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
// 목록 조회, 검색, 상태 계산을 위해 React 훅 사용

import { auth } from "@/lib/firebase.client";
// 현재 로그인한 관리자 토큰을 가져오기 위해 Firebase Auth 사용

import { useAdmin } from "@/components/admin/AdminShell";
// 공통 레이아웃에서 전달한 관리자 정보(email 등)를 사용하기 위한 훅

type UserRow = {
  uid: string;
  // 사용자 고유 uid

  email: string | null;
  // 사용자 이메일

  disabled: boolean;
  // 계정 정지 여부

  createdAt: string;
  // 계정 생성 시각

  lastSignInAt: string | null;
  // 마지막 로그인 시각
};

async function getIdTokenOrThrow() {
  // 현재 로그인한 관리자 계정의 ID Token을 가져오는 함수
  // 관리자 API 호출할 때 Authorization 헤더에 붙이는 데 사용

  const u = auth.currentUser;
  // 현재 로그인한 유저 정보 가져오기

  if (!u) throw new Error("NO_LOGIN");
  // 로그인 정보가 없으면 에러 발생

  return await u.getIdToken();
  // Firebase ID Token 반환
}

function formatDate(value: string | null) {
  // 날짜 문자열을 한국식 보기 좋은 형태로 바꾸는 함수

  if (!value) return "-";
  // 값이 없으면 - 표시

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
  // 한국 시간 표기 형태로 가공해서 반환
}

export default function AdminUsersPage() {
  const { admin } = useAdmin();
  // 현재 로그인한 관리자 정보를 가져옴

  const [users, setUsers] = useState<UserRow[]>([]);
  // 회원 목록 데이터 저장

  const [nextToken, setNextToken] = useState<string | null>(null);
  // 다음 페이지가 있을 때 Firebase listUsers 페이지 토큰 저장

  const [q, setQ] = useState("");
  // 검색 input 값 저장

  const [msg, setMsg] = useState<string | null>(null);
  // 실패 메시지 / 안내 메시지 저장

  const [loading, setLoading] = useState(true);
  // 목록을 불러오는 중인지 여부 저장

  const [busyUid, setBusyUid] = useState<string | null>(null);
  // 어떤 uid의 버튼이 현재 처리 중인지 저장
  // 정지/해제/삭제 버튼 중복 클릭 방지 용도

  const loadList = useCallback(async (pageToken?: string) => {
    // 회원 전체 목록을 불러오는 함수

    setMsg(null);
    // 이전 메시지 초기화

    setLoading(true);
    // 로딩 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 인증 토큰 가져오기

      const params = new URLSearchParams();
      // 쿼리스트링 구성용 객체 생성

      params.set("limit", "50");
      // 한 번에 50명씩 조회

      if (pageToken) {
        params.set("pageToken", pageToken);
        // 다음 페이지 조회 시 pageToken 추가
      }

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        // 회원 목록 API 호출

        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 토큰 전달
        },

        cache: "no-store",
        // 캐시 없이 최신 목록 요청
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        // 응답이 실패면

        setMsg(data?.error ?? "목록 조회 실패");
        // 에러 메시지 표시

        return;
      }

      setUsers(data.users ?? []);
      // 회원 목록 저장

      setNextToken(data.nextPageToken ?? null);
      // 다음 페이지 토큰 저장
    } catch {
      setMsg("목록 조회 실패");
      // 네트워크 오류 등 예외 발생 시 메시지 출력
    } finally {
      setLoading(false);
      // 요청 종료
    }
  }, []);

  const search = useCallback(async () => {
    // 이메일 또는 UID 정확 검색 함수

    const keyword = q.trim();
    // 앞뒤 공백 제거

    if (!keyword) {
      // 검색어가 비어 있으면

      loadList();
      // 전체 목록 다시 조회

      return;
    }

    setMsg(null);
    // 이전 메시지 초기화

    setLoading(true);
    // 로딩 시작

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 토큰 가져오기

      const params = new URLSearchParams();
      // 검색용 파라미터 준비

      params.set("q", keyword);
      // q 파라미터에 검색어 넣기

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        // 검색 API 호출

        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 인증 토큰 전달
        },

        cache: "no-store",
        // 캐시 없이 검색
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setMsg(data?.error ?? "검색 실패");
        // 실패 메시지 출력

        return;
      }

      setUsers(data.users ?? []);
      // 검색 결과 저장

      setNextToken(null);
      // 검색 결과는 다음 페이지 토큰 초기화
    } catch {
      setMsg("검색 실패");
      // 예외 발생 시 메시지 출력
    } finally {
      setLoading(false);
      // 로딩 종료
    }
  }, [q, loadList]);

  const setDisabled = async (uid: string, disabled: boolean) => {
    // 회원 정지 / 해제 처리 함수

    setMsg(null);
    // 이전 메시지 초기화

    setBusyUid(uid);
    // 지금 처리 중인 uid 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 토큰 가져오기

      const res = await fetch(`/api/admin/users/${uid}`, {
        // 특정 회원 상태 변경 API 호출

        method: "PATCH",
        // 부분 수정이므로 PATCH 사용

        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 토큰 전달

          "Content-Type": "application/json",
          // body가 JSON이므로 Content-Type 지정
        },

        body: JSON.stringify({ disabled }),
        // disabled true / false 값을 서버에 전달
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setMsg(data?.error ?? "처리 실패");
        // 실패 메시지 표시

        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, disabled } : u))
      );
      // 성공 시 화면에 보이는 users 상태도 즉시 갱신
    } catch {
      setMsg("처리 실패");
      // 예외 발생 시 실패 메시지 출력
    } finally {
      setBusyUid(null);
      // 처리 완료 후 busy 상태 해제
    }
  };

  const deleteUser = async (uid: string) => {
    // 회원 삭제 처리 함수

    const ok = confirm("정말 삭제하시겠습니까?");
    // 사용자에게 한 번 더 확인

    if (!ok) return;
    // 취소 누르면 종료

    setMsg(null);
    // 이전 메시지 초기화

    setBusyUid(uid);
    // 현재 처리 중인 uid 저장

    try {
      const token = await getIdTokenOrThrow();
      // 관리자 토큰 가져오기

      const res = await fetch(`/api/admin/users/${uid}`, {
        // 회원 삭제 API 호출

        method: "DELETE",
        // 삭제이므로 DELETE 사용

        headers: {
          Authorization: `Bearer ${token}`,
          // 관리자 토큰 전달
        },
      });

      const data = await res.json();
      // 응답 JSON 파싱

      if (!res.ok || !data.ok) {
        setMsg(data?.error ?? "삭제 실패");
        // 실패 메시지 표시

        return;
      }

      setUsers((prev) => prev.filter((u) => u.uid !== uid));
      // 성공 시 현재 목록에서 해당 회원 제거
    } catch {
      setMsg("삭제 실패");
      // 예외 발생 시 메시지 출력
    } finally {
      setBusyUid(null);
      // 처리 상태 해제
    }
  };

  useEffect(() => {
    loadList();
    // 페이지에 처음 들어오면 회원 전체 목록 불러오기
  }, [loadList]);

  const disabledCount = useMemo(
    () => users.filter((u) => u.disabled).length,
    [users]
  );
  // 현재 화면에 보이는 회원 중 정지 회원 수 계산

  const activeCount = useMemo(
    () => users.filter((u) => !u.disabled).length,
    [users]
  );
  // 현재 화면에 보이는 회원 중 정상 회원 수 계산

  const recentLoginCount = useMemo(
    () => users.filter((u) => !!u.lastSignInAt).length,
    [users]
  );
  // 마지막 로그인 기록이 있는 회원 수 계산

  return (
    <section className="space-y-8">
      {/* 전체 페이지 세로 간격 크게 */}

      <div className="rounded-[34px] border border-white/70 bg-white/85 p-8 shadow-[0_25px_80px_rgba(17,24,39,0.08)]">
        {/* 상단 제목 카드 */}

        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7c8cff]">
              Users
            </p>
            {/* 작은 섹션 라벨 */}

            <h1 className="mt-2 text-4xl font-black tracking-tight text-zinc-900">
              회원관리
            </h1>
            {/* 큰 제목 */}

            <p className="mt-3 text-base leading-7 text-zinc-500">
              회원 조회, 검색, 정지, 삭제를 한 화면에서 관리할 수 있어요.
            </p>
            {/* 설명 */}
          </div>

          <div className="rounded-[24px] bg-[linear-gradient(135deg,#f7f8ff_0%,#eefaff_100%)] px-6 py-5">
            {/* 우측 관리자 정보 박스 */}

            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Manager
            </p>

            <p className="mt-2 text-lg font-bold text-zinc-800">
              {admin?.email ?? "관리자"}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-4">
        {/* 요약 카드 4개를 크게 배치 */}

        <div className="rounded-[30px] bg-[linear-gradient(135deg,#8b7dff_0%,#6ea8ff_100%)] p-7 text-white shadow-lg">
          <p className="text-lg font-bold">전체 회원수</p>
          <p className="mt-5 text-[64px] font-black leading-none">
            {users.length}
          </p>
          <p className="mt-5 text-base text-white/90">현재 조회 결과 기준</p>
        </div>

        <div className="rounded-[30px] bg-[linear-gradient(135deg,#ff8ca8_0%,#ffb199_100%)] p-7 text-white shadow-lg">
          <p className="text-lg font-bold">정상 회원</p>
          <p className="mt-5 text-[64px] font-black leading-none">
            {activeCount}
          </p>
          <p className="mt-5 text-base text-white/90">사용 가능한 계정</p>
        </div>

        <div className="rounded-[30px] bg-[linear-gradient(135deg,#67d1ff_0%,#6ef3d6_100%)] p-7 text-white shadow-lg">
          <p className="text-lg font-bold">정지 회원</p>
          <p className="mt-5 text-[64px] font-black leading-none">
            {disabledCount}
          </p>
          <p className="mt-5 text-base text-white/90">비활성 상태 계정</p>
        </div>

        <div className="rounded-[30px] bg-[linear-gradient(135deg,#ffb86b_0%,#ffd86b_100%)] p-7 text-white shadow-lg">
          <p className="text-lg font-bold">로그인 이력</p>
          <p className="mt-5 text-[64px] font-black leading-none">
            {recentLoginCount}
          </p>
          <p className="mt-5 truncate text-base text-white/90">
            {admin?.email ?? "관리자"}
          </p>
        </div>
      </div>

      <div className="rounded-[34px] border border-white/70 bg-white/85 p-8 shadow-[0_25px_80px_rgba(17,24,39,0.08)]">
        {/* 검색 영역을 큰 카드로 분리 */}

        <div className="mb-6">
          <h2 className="text-2xl font-black text-zinc-900">검색</h2>
          <p className="mt-2 text-base text-zinc-500">
            이메일 또는 UID를 정확히 입력해서 회원을 찾을 수 있어요.
          </p>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,420px)_auto]">
          {/* 검색 input 과 버튼 영역을 크게 나눔 */}

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // input 값이 바뀔 때 q 상태 업데이트
            onKeyDown={(e) => {
              if (e.key === "Enter") search();
              // 엔터를 누르면 검색 실행
            }}
            className="h-[64px] w-full rounded-[22px] border border-zinc-200 bg-white px-5 text-base outline-none transition focus:border-[#7c8cff]"
            placeholder="이메일 또는 UID"
          />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={search}
              className="h-[64px] rounded-[22px] bg-[linear-gradient(135deg,#7c8cff_0%,#57d4ff_100%)] px-8 text-base font-bold text-white shadow-lg transition hover:opacity-90"
            >
              검색
            </button>

            <button
              onClick={() => {
                setQ("");
                // 검색어 초기화

                loadList();
                // 전체 목록 다시 로드
              }}
              className="h-[64px] rounded-[22px] bg-zinc-100 px-8 text-base font-bold text-zinc-800 transition hover:bg-zinc-200"
            >
              전체 목록
            </button>

            {nextToken && (
              <button
                onClick={() => loadList(nextToken)}
                className="h-[64px] rounded-[22px] bg-[linear-gradient(135deg,#ff8ca8_0%,#ffb199_100%)] px-8 text-base font-bold text-white shadow-lg transition hover:opacity-90"
              >
                다음 페이지
              </button>
            )}
          </div>
        </div>

        {msg && (
          <div className="mt-5 rounded-[22px] border border-rose-200 bg-rose-50 px-5 py-4 text-base text-rose-700">
            {msg}
          </div>
        )}
      </div>

      <div className="rounded-[34px] border border-white/70 bg-white/85 shadow-[0_25px_80px_rgba(17,24,39,0.08)]">
        {/* 회원 목록 테이블을 또 하나의 큰 카드로 분리 */}

        <div className="border-b border-zinc-100 px-8 py-6">
          <h2 className="text-2xl font-black text-zinc-900">회원 목록</h2>
          <p className="mt-2 text-base text-zinc-500">
            현재 조회된 회원 데이터를 큰 표로 확인할 수 있어요.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-base">
            {/* 표 전체 너비를 넉넉하게 줘서 답답하지 않게 */}

            <thead className="bg-[linear-gradient(90deg,#f7f8ff_0%,#fff7fb_50%,#f3fffb_100%)] text-left text-zinc-700">
              <tr>
                <th className="px-8 py-5 font-black">이메일</th>
                <th className="px-8 py-5 font-black">UID</th>
                <th className="px-8 py-5 font-black">상태</th>
                <th className="px-8 py-5 font-black">생성일</th>
                <th className="px-8 py-5 font-black">마지막 로그인</th>
                <th className="px-8 py-5 font-black">관리</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-8 py-5">
                      <div className="h-14 animate-pulse rounded-[18px] bg-zinc-100" />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-8 py-16 text-center text-lg text-zinc-500"
                  >
                    조회된 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isBusy = busyUid === u.uid;
                  // 현재 해당 회원의 버튼이 처리 중인지 여부

                  return (
                    <tr key={u.uid} className="hover:bg-zinc-50/70">
                      <td className="px-8 py-6 align-top font-medium text-zinc-800">
                        {u.email ?? "-"}
                      </td>

                      <td className="px-8 py-6 align-top">
                        <div className="max-w-[340px] break-all rounded-[18px] bg-zinc-50 px-4 py-3 font-mono text-sm text-zinc-600">
                          {u.uid}
                        </div>
                      </td>

                      <td className="px-8 py-6 align-top">
                        {u.disabled ? (
                          <span className="inline-flex rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-700">
                            정지
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700">
                            정상
                          </span>
                        )}
                      </td>

                      <td className="px-8 py-6 align-top text-zinc-700">
                        {formatDate(u.createdAt)}
                      </td>

                      <td className="px-8 py-6 align-top text-zinc-700">
                        {formatDate(u.lastSignInAt)}
                      </td>

                      <td className="px-8 py-6 align-top">
                        <div className="flex flex-wrap gap-3">
                          {!u.disabled ? (
                            <button
                              disabled={isBusy}
                              onClick={() => setDisabled(u.uid, true)}
                              className="rounded-[18px] bg-zinc-100 px-5 py-3 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
                            >
                              정지
                            </button>
                          ) : (
                            <button
                              disabled={isBusy}
                              onClick={() => setDisabled(u.uid, false)}
                              className="rounded-[18px] bg-zinc-100 px-5 py-3 text-sm font-bold text-zinc-800 transition hover:bg-zinc-200 disabled:opacity-60"
                            >
                              해제
                            </button>
                          )}

                          <button
                            disabled={isBusy}
                            onClick={() => deleteUser(u.uid)}
                            className="rounded-[18px] bg-rose-50 px-5 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            삭제
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