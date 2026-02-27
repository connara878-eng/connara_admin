// lib/firebase.client.ts
// 클라이언트(브라우저)에서만 쓰는 Firebase SDK
// - 관리자 로그인(Email/Password) + ID 토큰 발급 용도
// - 유저 정지/삭제 같은 민감 기능은 절대 여기서 하지 않음(보안상 서버에서만)

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

// 개발 모드에서 중복 초기화 방지
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);