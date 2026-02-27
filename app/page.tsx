// app/page.tsx
"use client";
// 관리자 로그인(메인 화면)
// - 로그인 자체는 firebase(클라이언트 SDK)로 처리
// - 실제 관리자 권한 확인은 서버(/api/admin/me)에서 함

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase.client";

export default function AdminLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!email.trim() || !pw.trim()) {
      setMsg("이메일/비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      router.replace("/admin/users");
    } catch (err: any) {
      setMsg(err?.message ?? "로그인 실패");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 grid place-items-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-extrabold text-zinc-900">Connara Admin</h1>
        <p className="mt-1 text-sm text-zinc-600">관리자 계정으로 로그인하세요.</p>

        <form onSubmit={onLogin} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-zinc-800">이메일</span>
            <input
              className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">비밀번호</span>
            <input
              className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              type="password"
            />
          </label>

          {msg && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              {msg}
            </div>
          )}

          <button
            disabled={submitting}
            className="w-full rounded-md bg-[#003F8D] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </main>
  );
}