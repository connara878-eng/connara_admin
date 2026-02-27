// lib/firebase.admin.ts
// 서버(API Route)에서만 쓰는 Firebase Admin SDK
// - Auth 사용자 목록 조회 / 정지(disabled) / 삭제 같은 관리자 권한 작업 담당
// - 이 파일은 절대 클라이언트 컴포넌트에서 import 하면 안 됨(키 노출 위험)

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// .env.local에 넣은 private key는 "\n" 문자열이 들어가서, 실제 줄바꿈으로 복원해야 함
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

const adminApp =
  getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
          privateKey: privateKey!,
        }),
      });

export const adminAuth = getAuth(adminApp);