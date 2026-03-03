// lib/firebase.admin.ts

// 서버(API Route)에서만 쓰는 Firebase Admin SDK 설정 파일
// - 관리자 권한으로 Firebase Auth / Firestore 작업 처리
// - 이 파일은 절대 클라이언트 컴포넌트에서 import 하면 안 됨

import { cert, getApps, initializeApp } from "firebase-admin/app";
// Firebase Admin 앱 초기화에 필요한 함수들 import

import { getAuth } from "firebase-admin/auth";
// 관리자 권한으로 Auth 사용자 조회 / 정지 / 삭제를 하기 위한 Auth 인스턴스 생성 함수

import { getFirestore } from "firebase-admin/firestore";
// 관리자 권한으로 Firestore 게시글 / 댓글 데이터를 읽고 수정 / 삭제하기 위한 Firestore 인스턴스 생성 함수

const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
// .env.local 에 넣은 private key는 줄바꿈이 \n 문자열로 들어가므로
// 실제 줄바꿈으로 복원해야 정상 동작함

const adminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
          // Firebase 프로젝트 아이디

          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
          // Firebase 서비스 계정 이메일

          privateKey: privateKey!,
          // 줄바꿈 복원한 private key
        }),
      });
// 개발 중 핫리로드 때문에 앱이 여러 번 초기화되지 않게
// 이미 있으면 기존 앱을 재사용하고, 없으면 새로 초기화함

export const adminAuth = getAuth(adminApp);
// 관리자 권한 Auth 인스턴스 export

export const adminDb = getFirestore(adminApp);
// 관리자 권한 Firestore 인스턴스 export