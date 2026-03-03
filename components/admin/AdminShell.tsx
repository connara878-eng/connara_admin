"use client";

// 경로: components/admin/AdminShell.tsx

import Link from "next/link";
// 왼쪽 메뉴 클릭 시 각 관리자 페이지로 이동시키기 위해 사용

import { usePathname, useRouter } from "next/navigation";
// usePathname: 현재 어떤 메뉴가 선택되어 있는지 확인할 때 사용
// useRouter: 로그아웃 후 로그인 페이지로 이동시킬 때 사용

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
// createContext / useContext: 현재 로그인한 관리자 정보를 하위 페이지와 공유
// useEffect: 로그인 상태 감지 + 관리자 권한 확인
// useMemo: 메뉴 배열을 고정
// useState: checking, admin 상태 관리

import { auth } from "@/lib/firebase.client";
// Firebase 클라이언트 Auth 인스턴스 import

import { onAuthStateChanged, signOut } from "firebase/auth";
// onAuthStateChanged: 로그인 상태 감지
// signOut: 로그아웃 처리

type AdminMe = {
  uid: string;
  // 현재 로그인한 관리자 uid

  email: string | null;
  // 현재 로그인한 관리자 email
};

type AdminContextValue = {
  admin: AdminMe | null;
  // 하위 페이지에 공통으로 넘겨줄 관리자 정보
};

const AdminContext = createContext<AdminContextValue>({
  admin: null,
});
// 기본값은 관리자 정보가 없는 상태

export function useAdmin() {
  // 하위 페이지에서 useAdmin()으로 관리자 정보를 쉽게 꺼내 쓰도록 만든 훅
  return useContext(AdminContext);
}

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  // 코드로 페이지 이동할 때 사용

  const pathname = usePathname();
  // 현재 경로를 읽어서 활성 메뉴를 표시할 때 사용

  const [checking, setChecking] = useState(true);
  // 관리자 권한 확인 중인지 여부

  const [admin, setAdmin] = useState<AdminMe | null>(null);
  // 서버에서 관리자 권한까지 검증된 사용자 정보 저장

  useEffect(() => {
    let alive = true;
    // 비동기 작업이 끝났을 때 컴포넌트가 이미 사라졌으면 state 변경을 막기 위한 안전장치

    const unsub = onAuthStateChanged(auth, async (user) => {
      // Firebase 로그인 상태가 바뀔 때마다 실행되는 콜백

      if (!user) {
        // 로그인 자체가 안 되어 있으면 관리자 화면에 들어오면 안 되므로

        if (alive) setChecking(false);
        // 확인 상태 종료

        router.replace("/");
        // 로그인 페이지로 이동

        return;
      }

      try {
        const token = await user.getIdToken();
        // 현재 로그인한 계정의 Firebase ID Token 발급

        const res = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${token}`,
            // 서버에 Bearer 토큰 전달
          },
          cache: "no-store",
          // 캐시 없이 항상 최신 권한 상태를 확인
        });

        const data = await res.json().catch(() => null);
        // 응답 JSON 파싱
        // 실패하면 null 처리

        if (!res.ok || !data?.ok) {
          // 응답 실패 또는 관리자 권한 없음

          await signOut(auth).catch(() => {});
          // 안전하게 로그아웃 처리

          router.replace("/");
          // 로그인 페이지로 이동

          return;
        }

        if (alive) {
          setAdmin({
            uid: data.uid,
            // 검증된 관리자 uid 저장

            email: data.email ?? null,
            // 검증된 관리자 email 저장
          });
        }
      } catch {
        // 토큰 발급 / 관리자 확인 / 네트워크 요청 중 오류가 나면

        await signOut(auth).catch(() => {});
        // 안전하게 로그아웃

        router.replace("/");
        // 로그인 페이지로 이동
      } finally {
        if (alive) setChecking(false);
        // 성공/실패와 관계없이 확인 상태 종료
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
      },
      // 기본 진입 메뉴

      {
        href: "/admin/posts",
        label: "게시글 관리",
      },
      // 게시글 관리 메뉴

      {
        href: "/admin/notices",
        label: "공지사항 관리",
      },
      // 공지사항 관리 메뉴
    ],
    []
  );
  // 메뉴 배열은 고정값이라 useMemo로 한 번만 생성

  if (checking) {
    // 관리자 권한 확인 중일 때는 간단한 로딩 화면 표시

    return (
      <div className="grid min-h-screen place-items-center bg-[#dfe3ea] px-6">
        <div className="rounded-[24px] bg-white px-10 py-8 shadow-sm">
          <p className="text-xl font-bold text-[#003F8D]">관리자 확인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ admin }}>
      {/* 하위 페이지들이 관리자 정보를 공유할 수 있게 Provider로 감쌈 */}

      <div className="h-screen overflow-hidden bg-[#dfe3ea]">
        {/* 전체 화면 높이를 viewport 기준으로 고정 */}
        {/* overflow-hidden을 줘서 body 전체가 같이 스크롤되지 않게 막음 */}

        <aside className="fixed left-0 top-0 h-screen w-[260px] bg-[#003F8D]">
          {/* 사이드바를 화면 왼쪽에 고정 */}
          {/* fixed + h-screen으로 스크롤해도 항상 같은 자리에 보이게 함 */}

          <div className="flex h-full flex-col px-6 py-10">
            {/* 사이드바 안쪽 전체를 세로 방향으로 배치 */}
            {/* h-full을 줘야 위/아래 영역을 끝까지 나눌 수 있음 */}

            <nav className="space-y-10">
              {/* 메뉴끼리 간격을 넉넉하게 줘서 예시처럼 크게 보이게 함 */}

              {menus.map((item) => {
                const active = pathname === item.href;
                // 현재 주소와 메뉴 href가 같으면 선택된 메뉴로 처리

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex h-[58px] items-center justify-center rounded-full text-[20px] font-semibold transition ${
                      active
                        ? "bg-white text-[#1f1f1f] shadow-sm"
                        : "bg-white text-[#1f1f1f] hover:opacity-90"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto">
              {/* 사이드바 맨 아래 영역 */}
              {/* mt-auto를 줘서 관리자 정보 / 로그아웃 버튼이 아래로 밀리게 함 */}

              <div className="rounded-[20px] bg-white/10 px-4 py-4 text-white">
                {/* 로그인한 관리자 정보를 보여주는 하단 박스 */}

                <p className="text-xs uppercase tracking-[0.16em] text-white/70">
                  signed in
                </p>

                <p className="mt-2 break-all text-sm font-semibold">
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
                className="mt-4 h-[52px] w-full rounded-[18px] bg-white text-[16px] font-bold text-[#003F8D] transition hover:opacity-90"
              >
                로그아웃
              </button>
            </div>
          </div>
        </aside>

        <main className="ml-[260px] h-screen overflow-y-auto bg-[#dfe3ea] px-10 py-8">
          {/* 본문은 사이드바 너비만큼 왼쪽 여백을 줘서 겹치지 않게 함 */}
          {/* h-screen + overflow-y-auto를 줘서 오직 이 영역만 세로 스크롤되게 함 */}
          {/* 즉, 사이드바는 고정되고 오른쪽 화면 내용만 스크롤됨 */}

        
          {children}
          {/* 실제 회원관리 / 게시글관리 / 공지사항 페이지 내용이 여기 들어옴 */}
        </main>
      </div>
    </AdminContext.Provider>
  );
}