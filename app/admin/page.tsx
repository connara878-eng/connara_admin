// app/admin/page.tsx

import { redirect } from "next/navigation";
// 서버 컴포넌트에서 바로 다른 페이지로 이동시키기 위해 사용

export default function AdminIndexPage() {
  redirect("/admin/users");
  // /admin 으로 접속하면 기본적으로 회원관리 페이지로 이동
}