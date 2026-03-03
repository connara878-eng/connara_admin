"use client";

// 경로: components/admin/AdminShell.tsx

import Link from "next/link";
// 왼쪽 메뉴를 눌렀을 때 각 관리자 페이지로 이동시키기 위해 Link 사용

import { usePathname, useRouter } from "next/navigation";
// usePathname: 현재 주소가 어떤 메뉴인지 확인해서 활성 메뉴 표시할 때 사용
// useRouter: 로그아웃 후 로그인 페이지로 이동시키기 위해 사용

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
// createContext / useContext: 현재 로그인한 관리자 정보를 하위 페이지와 공유
// useEffect: 로그인 상태 감지 + 관리자 권한 체크
// useMemo: 메뉴 배열을 고정해서 불필요한 재생성 방지
// useState: checking, admin 상태 관리

import { auth } from "@/lib/firebase.client";
// Firebase 클라이언트 Auth 인스턴스 사용

import { onAuthStateChanged, signOut } from "firebase/auth";
// onAuthStateChanged: 현재 로그인 상태를 감지
// signOut: 로그아웃 처리

type AdminMe = {
  uid: string;
  // 현재 로그인한 관리자 uid

  email: string | null;
  // 현재 로그인한 관리자 email
};

type AdminContextValue = {
  admin: AdminMe | null;
  // 하위 페이지에 넘겨줄 관리자 정보
};

const AdminContext = createContext<AdminContextValue>({
  admin: null,
});
// 기본값은 아직 관리자 정보가 없는 상태

export function useAdmin() {
  // 하위 페이지에서 useAdmin()만 호출하면
  // 현재 관리자 정보를 쉽게 꺼내 쓸 수 있게 만든 훅
  return useContext(AdminContext);
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // 로그아웃 후 로그인 페이지로 이동할 때 사용

  const pathname = usePathname();
  // 현재 경로를 읽어서 어떤 메뉴가 활성화인지 판단할 때 사용

  const [checking, setChecking] = useState(true);
  // 관리자 권한을 확인 중인지 여부
  // true이면 본문 대신 확인 중 화면을 보여줌

  const [admin, setAdmin] = useState<AdminMe | null>(null);
  // 서버에서 관리자 권한 확인이 끝난 사용자 정보 저장

  useEffect(() => {
    let alive = true;
    // 비동기 작업 도중 컴포넌트가 사라졌을 때 state 업데이트 막는 안전장치

    const unsub = onAuthStateChanged(auth, async (user) => {
      // Firebase 로그인 상태가 바뀔 때마다 실행됨

      if (!user) {
        // 로그인된 사용자가 없으면 관리자 페이지를 볼 수 없으므로

        if (alive) setChecking(false);
        // 확인 과정 종료

        router.replace("/");
        // 로그인 페이지로 이동

        return;
      }

      try {
        const token = await user.getIdToken();
        // 현재 로그인된 유저의 Firebase ID Token 발급
        // 이 토큰을 서버에 보내서 진짜 관리자 권한인지 확인

        const res = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            // 관리자 확인 API에 Bearer 토큰 전달
          },
          cache: "no-store",
          // 캐시 없이 항상 최신 권한 상태를 조회
        });

        const data = await res.json().catch(() => null);
        // 응답을 JSON으로 파싱
        // 혹시 파싱 실패하면 null 처리

        if (!res.ok || !data?.ok) {
          // 서버가 관리자 권한이 없다고 판단했거나
          // 응답 자체가 실패했으면

          await signOut(auth).catch(() => {});
          // 혹시 로그인은 되어 있어도 관리자 권한 없는 계정이면 로그아웃

          router.replace("/");
          // 로그인 페이지로 이동

          return;
        }

        if (alive) {
          setAdmin({
            uid: data.uid,
            // 서버가 확인해준 관리자 uid 저장

            email: data.email ?? null,
            // 서버가 확인해준 관리자 email 저장
          });
        }
      } catch {
        // 토큰 발급, 서버 요청, 권한 확인 중 에러가 나면

        await signOut(auth).catch(() => {});
        // 안전하게 로그아웃 처리

        router.replace("/");
        // 로그인 페이지로 이동
      } finally {
        if (alive) setChecking(false);
        // 성공/실패와 상관없이 확인 과정 종료
      }
    });

    return () => {
      alive = false;
      // 컴포넌트가 사라졌다고 표시

      unsub();
      // 로그인 상태 감지 구독 해제
    };
  }, [router]);

  const menus = useMemo(
    () => [
      {
        href: "/admin/users",
        label: "회원 관리",
        color:
          "bg-[linear-gradient(135deg,#7C8CFF_0%,#5BC6FF_50%,#63E6BE_100%)]",
      },
      // 회원관리 메뉴
      // 가장 먼저 들어와서 기본 선택될 메뉴

      {
        href: "/admin/posts",
        label: "게시글 관리",
        color:
          "bg-[linear-gradient(135deg,#FF8DA1_0%,#FFB36B_100%)]",
      },
      // 게시글 관리 메뉴

      {
        href: "/admin/notices",
        label: "공지사항 관리",
        color:
          "bg-[linear-gradient(135deg,#9B8CFF_0%,#FF8FD8_100%)]",
      },
      // 공지사항 관리 메뉴
    ],
    []
  );
  // 메뉴 목록은 고정값이므로 useMemo로 한 번만 생성

  if (checking) {
    // 아직 관리자 권한 확인 중이면 전체 레이아웃 대신 로딩 화면만 표시

    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#F5F7FF_0%,#FFF8FC_100%)]">
        {/* 전체 배경을 부드러운 밝은 톤으로 설정 */}

        <div className="grid min-h-screen place-items-center px-6">
          {/* 화면 가운데에 카드가 오도록 중앙 정렬 */}

          <div className="w-full max-w-xl rounded-[36px] bg-white p-10 text-center shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
            {/* 큼직한 중앙 카드 */}

            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-[linear-gradient(135deg,#7C8CFF_0%,#5BC6FF_100%)] text-3xl font-black text-white">
              C
            </div>
            {/* 브랜드 느낌의 큰 아이콘 박스 */}

            <h1 className="mt-5 text-2xl font-black text-zinc-900">
              관리자 확인 중...
            </h1>
            {/* 로딩 제목 */}

            <p className="mt-3 text-base text-zinc-500">
              로그인 상태와 관리자 권한을 확인하고 있어요.
            </p>
            {/* 보조 설명 */}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ admin }}>
      {/* 하위 관리자 페이지들이 admin 정보를 공유할 수 있게 Provider로 감쌈 */}

      <div className="min-h-screen bg-[linear-gradient(180deg,#F5F7FF_0%,#FFF8FC_100%)]">
        {/* 전체 관리자 페이지 배경 */}

        <div className="mx-auto grid min-h-screen max-w-[1900px] grid-cols-1 gap-6 p-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          {/* 큰 화면에서는 좌측 사이드바 + 우측 본문 2단 구조 */}
          {/* 사이드바를 크게 보이게 하려고 340px로 넉넉하게 잡음 */}

          <aside className="rounded-[38px] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.08)]">
            {/* 왼쪽 사이드바 전체 카드 */}
            {/* 둥글고 크게 만들어서 일반 서비스 페이지 느낌이 나게 구성 */}

            <div className="rounded-[30px] bg-[linear-gradient(135deg,#7C8CFF_0%,#5BC6FF_50%,#63E6BE_100%)] p-6 text-white">
              {/* 사이드바 상단 브랜드 영역 */}

              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-white/20 text-2xl font-black">
                C
              </div>
              {/* 큰 아이콘 박스 */}

              <p className="mt-5 text-sm font-semibold uppercase tracking-[0.2em] text-white/80">
                Connara Admin
              </p>
              {/* 작은 라벨 */}

              <h1 className="mt-2 text-3xl font-black leading-tight">
                관리자
                <br />
                대시보드
              </h1>
              {/* 큰 제목 */}
            </div>

            <div className="mt-6">
              {/* 메뉴 영역 시작 */}

              <p className="mb-4 px-2 text-sm font-bold text-zinc-400">
                MENU
              </p>
              {/* 메뉴 구분 라벨 */}

              <nav className="space-y-4">
                {/* 메뉴 간격을 크게 둬서 한눈에 잘 보이게 함 */}

                {menus.map((item) => {
                  const active = pathname === item.href;
                  // 현재 경로가 메뉴 href와 같으면 활성 메뉴 처리

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block rounded-[28px] px-6 py-6 text-xl font-black transition ${
                        active
                          ? `${item.color} text-white shadow-[0_18px_35px_rgba(0,0,0,0.12)]`
                          : "bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="mt-8 rounded-[28px] bg-zinc-50 p-5">
              {/* 로그인한 관리자 정보 박스 */}

              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Signed In
              </p>

              <p className="mt-3 break-all text-lg font-bold text-zinc-800">
                {admin?.email ?? "관리자"}
              </p>
            </div>

            <button
              onClick={async () => {
                // 로그아웃 버튼 클릭 시

                await signOut(auth);
                // Firebase 로그아웃 실행

                router.replace("/");
                // 로그인 페이지로 이동
              }}
              className="mt-5 h-[64px] w-full rounded-[24px] bg-zinc-900 text-lg font-bold text-white transition hover:opacity-90"
            >
              로그아웃
            </button>
          </aside>

          <main className="min-w-0">
            {/* 오른쪽 본문 영역 */}
            {/* 실제 회원관리 / 게시글관리 / 공지사항 페이지 내용이 들어옴 */}

            {children}
          </main>
        </div>
      </div>
    </AdminContext.Provider>
  );
}