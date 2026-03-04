"use client";

// app/page.tsx

import { useState } from "react";
// 이메일, 비밀번호, 메시지, 로딩 상태를 관리하기 위해 사용

import { useRouter } from "next/navigation";
// 로그인 성공 후 관리자 페이지로 이동시키기 위해 사용

import { signInWithEmailAndPassword } from "firebase/auth";
// Firebase 이메일/비밀번호 로그인 함수

import { auth } from "@/lib/firebase.client";
// Firebase 클라이언트 Auth 인스턴스

export default function AdminLoginPage() {
  const router = useRouter();
  // 코드로 페이지 이동할 때 사용

  const [email, setEmail] = useState("");
  // 이메일 입력창 값 저장

  const [pw, setPw] = useState("");
  // 비밀번호 입력창 값 저장

  const [msg, setMsg] = useState<string | null>(null);
  // 에러 메시지나 안내 메시지 저장

  const [submitting, setSubmitting] = useState(false);
  // 로그인 요청 중인지 여부 저장
  // true일 때 버튼 비활성화해서 중복 클릭 방지

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    // form 기본 새로고침 막기

    setMsg(null);
    // 이전 메시지 초기화

    if (!email.trim() || !pw.trim()) {
      setMsg("이메일 / 비밀번호를 입력하세요.");
      // 이메일 또는 비밀번호가 비어 있으면 안내 메시지 출력
      return;
    }

    setSubmitting(true);
    // 로그인 요청 시작

    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
      // Firebase 이메일/비밀번호 로그인 실행

      router.replace("/admin/users");
      // 로그인 성공 시 회원관리 페이지로 이동
    } catch (err: any) {
      setMsg(err?.message ?? "로그인 실패");
      // Firebase 에러 메시지가 있으면 출력하고 없으면 기본 메시지 출력
    } finally {
      setSubmitting(false);
      // 요청 성공/실패와 상관없이 로딩 종료
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      {/* 화면 전체를 단순한 밝은 배경으로 구성 */}

      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        {/* 관리자 로그인 폼만 담는 단순한 카드 */}

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-zinc-900">관리자 로그인</h1>
          {/* 페이지 제목 */}

          <p className="mt-2 text-sm text-zinc-500">
            관리자 계정으로 로그인해 주세요.
          </p>
          {/* 보조 설명 */}
        </div>

        <form onSubmit={onLogin} className="space-y-5">
          {/* 로그인 폼 */}

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              이메일
            </label>
            {/* 이메일 라벨 */}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // 입력값이 바뀔 때 email 상태 업데이트
              className="h-12 w-full rounded-lg border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">
              비밀번호
            </label>
            {/* 비밀번호 라벨 */}

            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              // 입력값이 바뀔 때 pw 상태 업데이트
              className="h-12 w-full rounded-lg border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-900"
              placeholder="비밀번호 입력"
            />
          </div>

          {msg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {msg}
            </div>
          )}
          {/* 에러 메시지가 있을 때만 표시 */}

          <button
            type="submit"
            disabled={submitting}
            className="h-12 w-full rounded-lg bg-zinc-900 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
          {/* 로그인 버튼 */}
        </form>
      </div>
    </main>
  );
}