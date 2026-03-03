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
      // 이메일 또는 비밀번호가 비어 있으면

      setMsg("이메일 / 비밀번호를 입력하세요.");
      // 안내 메시지 출력

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
    <main className="min-h-screen bg-[linear-gradient(135deg,#eef4ff_0%,#fff3fb_45%,#effff8_100%)] px-6 py-10">
      {/* 전체 배경을 화사한 블루/핑크/민트 계열로 크게 깔아줌 */}

      <div className="mx-auto grid min-h-[calc(100vh-80px)] max-w-[1800px] overflow-hidden rounded-[40px] border border-white/70 bg-white/70 shadow-[0_30px_90px_rgba(17,24,39,0.10)] backdrop-blur xl:grid-cols-[1.15fr_0.85fr]">
        {/* 로그인 화면 전체를 큰 카드처럼 구성 */}

        <section className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#7c8cff_0%,#57d4ff_45%,#7df0c6_100%)] p-12 text-white xl:flex xl:flex-col">
          {/* 왼쪽 비주얼 영역 */}
          {/* 큰 화면에서만 보여주고, 작은 화면에서는 로그인 폼만 보이게 처리 */}

          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.28),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.20),transparent_30%)]" />
          {/* 배경에 은은한 원형 빛 효과 추가 */}

          <div className="relative z-10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-white/85">
              Connara Admin
            </p>
            {/* 작은 라벨 */}

            <h1 className="mt-8 text-6xl font-black leading-[1.05]">
              Bright
              <br />
              Clean
              <br />
              Dashboard
            </h1>
            {/* 크게 보이는 비주얼 타이틀 */}

            <p className="mt-8 max-w-xl text-lg leading-8 text-white/90">
              딱딱한 관리툴 느낌보다,
              보기 좋고 한눈에 들어오는 일반 서비스 페이지 감성으로 만든 관리자 로그인 화면이야.
            </p>
          </div>

          <div className="relative z-10 mt-auto grid gap-5 lg:grid-cols-2">
            {/* 하단 소개 카드 2개 */}

            <div className="rounded-[30px] border border-white/20 bg-white/15 p-6 backdrop-blur">
              <p className="text-xl font-black">회원관리</p>
              <p className="mt-3 text-base text-white/90">
                회원 조회, 검색, 정지, 해제를 큰 화면에서 쉽게 관리할 수 있어.
              </p>
            </div>

            <div className="rounded-[30px] border border-white/20 bg-white/15 p-6 backdrop-blur">
              <p className="text-xl font-black">게시물 / 공지사항</p>
              <p className="mt-3 text-base text-white/90">
                메뉴를 분리해서 콘텐츠 운영도 깔끔하게 관리할 수 있어.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center p-8 md:p-12">
          {/* 오른쪽 로그인 폼 영역 */}

          <div className="w-full max-w-xl">
            {/* 로그인 카드 내용 폭을 넉넉하게 줌 */}

            <div className="mb-8">
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#7c8cff_0%,#57d4ff_100%)] text-3xl font-black text-white shadow-lg">
                C
              </div>
              {/* 로그인 상단 아이콘 */}

              <h2 className="mt-7 text-4xl font-black tracking-tight text-zinc-900">
                관리자 로그인
              </h2>
              {/* 메인 제목 */}

              <p className="mt-3 text-base leading-7 text-zinc-500">
                관리자 계정으로 로그인하면 기본 화면이 회원관리 페이지로 열려요.
              </p>
              {/* 보조 설명 */}
            </div>

            <form onSubmit={onLogin} className="space-y-5">
              {/* 로그인 폼 */}

              <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_rgba(17,24,39,0.06)]">
                {/* 입력칸들을 감싸는 큰 카드 */}

                <div>
                  <label className="mb-3 block text-base font-bold text-zinc-700">
                    이메일
                  </label>
                  {/* 이메일 라벨 */}

                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    // 입력값이 바뀔 때 email 상태 업데이트
                    className="h-[60px] w-full rounded-[20px] border border-zinc-200 bg-white px-5 text-base outline-none transition focus:border-[#7c8cff]"
                    placeholder="admin@example.com"
                  />
                </div>

                <div className="mt-5">
                  <label className="mb-3 block text-base font-bold text-zinc-700">
                    비밀번호
                  </label>
                  {/* 비밀번호 라벨 */}

                  <input
                    type="password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    // 입력값이 바뀔 때 pw 상태 업데이트
                    className="h-[60px] w-full rounded-[20px] border border-zinc-200 bg-white px-5 text-base outline-none transition focus:border-[#57d4ff]"
                    placeholder="비밀번호 입력"
                  />
                </div>

                {msg && (
                  <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-5 py-4 text-base text-rose-700">
                    {msg}
                  </div>
                )}
                {/* 에러 메시지가 있을 때만 표시 */}
              </div>

              <button
                disabled={submitting}
                className="h-[64px] w-full rounded-[24px] bg-[linear-gradient(135deg,#7c8cff_0%,#57d4ff_50%,#7df0c6_100%)] text-lg font-black text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "로그인 중..." : "로그인"}
              </button>
              {/* 로그인 버튼 */}
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}