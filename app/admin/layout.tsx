// app/admin/layout.tsx

import AdminShell from "@/components/admin/AdminShell";
// /admin 아래 페이지들을 공통 관리자 레이아웃으로 감싸기 위해 import

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminShell>{children}</AdminShell>;
  // /admin 하위의 모든 페이지는 AdminShell 안에서 렌더링됨
}