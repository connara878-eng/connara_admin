// app/admin/users/page.tsx
"use client";
// 관리자 회원 관리 화면
// - 서버 API를 통해서만 유저 목록/정지/삭제 처리
// - 클라이언트에서 admin sdk를 직접 쓰지 않음(보안)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase.client";
import { signOut } from "firebase/auth";

type UserRow = {
  uid: string;
  email: string | null;
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
};

async function getIdTokenOrThrow() {
  const u = auth.currentUser;
  if (!u) throw new Error("NO_LOGIN");
  return await u.getIdToken();
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // 페이지 진입 시 admin 여부 확인
  useEffect(() => {
    (async () => {
      try {
        const token = await getIdTokenOrThrow();
        const res = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          router.replace("/");
          return;
        }

        setChecking(false);
      } catch {
        router.replace("/");
      }
    })();
  }, [router]);

  const loadList = async (pageToken?: string) => {
    setMsg(null);
    const token = await getIdTokenOrThrow();

    const url = new URL("/api/admin/users", window.location.origin);
    url.searchParams.set("limit", "50");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setMsg(data?.error ?? "목록 조회 실패");
      return;
    }

    setUsers(data.users ?? []);
    setNextToken(data.nextPageToken ?? null);
  };

  const search = async () => {
    setMsg(null);
    const token = await getIdTokenOrThrow();

    const url = new URL("/api/admin/users", window.location.origin);
    url.searchParams.set("q", q.trim());

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      setMsg(data?.error ?? "검색 실패");
      return;
    }

    setUsers(data.users ?? []);
    setNextToken(null);
  };

  const setDisabled = async (uid: string, disabled: boolean) => {
    setMsg(null);
    setBusyUid(uid);

    try {
      const token = await getIdTokenOrThrow();
      const res = await fetch(`/api/admin/users/${uid}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ disabled }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data?.error ?? "처리 실패");
        return;
      }

      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, disabled } : u)));
    } finally {
      setBusyUid(null);
    }
  };

  const deleteUser = async (uid: string) => {
    const ok = confirm("정말 삭제할까요? (복구 어려움)");
    if (!ok) return;

    setMsg(null);
    setBusyUid(uid);

    try {
      const token = await getIdTokenOrThrow();
      const res = await fetch(`/api/admin/users/${uid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setMsg(data?.error ?? "삭제 실패");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.uid !== uid));
    } finally {
      setBusyUid(null);
    }
  };

  useEffect(() => {
    if (!checking) loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking]);

  const disabledCount = useMemo(() => users.filter((u) => u.disabled).length, [users]);

  if (checking) {
    return <div className="min-h-screen grid place-items-center text-zinc-600">관리자 확인 중...</div>;
  }

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-zinc-900">회원 관리</h1>
            <p className="mt-1 text-sm text-zinc-600">
              총 {users.length}명 (정지 {disabledCount}명)
            </p>
          </div>

          <button
            onClick={async () => {
              await signOut(auth);
              router.replace("/");
            }}
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            로그아웃
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-[360px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
              placeholder="이메일(정확히) 또는 UID(정확히)"
            />

            <button
              onClick={search}
              className="rounded-md bg-[#003F8D] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              검색
            </button>

            <button
              onClick={() => {
                setQ("");
                loadList();
              }}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              전체 목록
            </button>

            {nextToken && (
              <button
                onClick={() => loadList(nextToken)}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              >
                다음 페이지
              </button>
            )}
          </div>

          {msg && (
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              {msg}
            </div>
          )}

          <div className="mt-5 overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="text-left text-zinc-600">
                <tr>
                  <th className="py-2">Email</th>
                  <th className="py-2">UID</th>
                  <th className="py-2">상태</th>
                  <th className="py-2">생성</th>
                  <th className="py-2">마지막 로그인</th>
                  <th className="py-2">액션</th>
                </tr>
              </thead>
              <tbody className="text-zinc-900">
                {users.map((u) => (
                  <tr key={u.uid} className="border-t border-zinc-200">
                    <td className="py-2">{u.email ?? "-"}</td>
                    <td className="py-2 font-mono text-xs">{u.uid}</td>
                    <td className="py-2">
                      {u.disabled ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                          정지
                        </span>
                      ) : (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          정상
                        </span>
                      )}
                    </td>
                    <td className="py-2">{u.createdAt}</td>
                    <td className="py-2">{u.lastSignInAt ?? "-"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {!u.disabled ? (
                          <button
                            disabled={busyUid === u.uid}
                            onClick={() => setDisabled(u.uid, true)}
                            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                          >
                            정지
                          </button>
                        ) : (
                          <button
                            disabled={busyUid === u.uid}
                            onClick={() => setDisabled(u.uid, false)}
                            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                          >
                            해제
                          </button>
                        )}

                        <button
                          disabled={busyUid === u.uid}
                          onClick={() => deleteUser(u.uid)}
                          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:opacity-90 disabled:opacity-60"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500">
                      조회된 사용자가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}