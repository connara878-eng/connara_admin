// lib/firebase.admin.ts

// 서버(API Route)에서만 쓰는 Firebase Admin SDK 설정 파일
// - 관리자 권한으로 Firebase Auth / Firestore 작업 처리
// - 이 파일은 절대 클라이언트 컴포넌트에서 import 하면 안 됨
// - 빌드 시점에 환경변수 누락으로 바로 터지는 걸 줄이기 위해
//   "필요할 때 초기화"하는 구조로 작성
// - 기존 코드 호환을 위해
//   adminAuth / adminDb 이름도 그대로 export 해줌

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
// Firebase Admin 앱 초기화 관련 함수들

import { getAuth } from "firebase-admin/auth";
// 관리자 권한 Auth 인스턴스 생성 함수

import { getFirestore } from "firebase-admin/firestore";
// 관리자 권한 Firestore 인스턴스 생성 함수

function getRequiredEnv(name: string) {
  // 필수 환경변수를 읽는 함수
  // 값이 없으면 어떤 환경변수가 빠졌는지 명확히 에러를 던짐

  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`MISSING_ENV:${name}`);
  }

  return value;
}

function getAdminApp() {
  // Firebase Admin App을 필요할 때 초기화해서 반환하는 함수
  // 이미 초기화된 앱이 있으면 재사용하고, 없으면 새로 만든다

  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = getRequiredEnv("FIREBASE_ADMIN_PROJECT_ID");
  // Firebase 서비스 계정의 project_id

  const clientEmail = getRequiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  // Firebase 서비스 계정의 client_email

  const privateKey = getRequiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(
    /\\n/g,
    "\n"
  );
  // .env.local / Vercel 환경변수에 들어간 \n 문자열을 실제 줄바꿈으로 복원

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export function getAdminAuth() {
  // 함수형으로 Auth 인스턴스를 가져오고 싶을 때 사용
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  // 함수형으로 Firestore 인스턴스를 가져오고 싶을 때 사용
  return getFirestore(getAdminApp());
}

// -------------------------------------------------------------------
// 기존 코드 호환용 export
// -------------------------------------------------------------------
// 예전 코드가 import { adminAuth, adminDb } 형태를 그대로 써도
// 동작할 수 있게 lazy getter 형태의 proxy를 만든다.
// 즉, 실제 메서드에 접근하는 순간 그때 Admin SDK가 초기화된다.

type AnyObject = Record<string, unknown>;

function createLazyProxy<T extends object>(factory: () => T): T {
  // 실제 객체를 나중에 만들기 위한 공통 proxy 생성 함수

  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const real = factory();
      return Reflect.get(real as unknown as AnyObject, prop, receiver);
    },
    set(_target, prop, value, receiver) {
      const real = factory();
      return Reflect.set(real as unknown as AnyObject, prop, value, receiver);
    },
    has(_target, prop) {
      const real = factory();
      return prop in real;
    },
    ownKeys() {
      const real = factory();
      return Reflect.ownKeys(real);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const real = factory();
      return Object.getOwnPropertyDescriptor(real, prop);
    },
  });
}

export const adminAuth = createLazyProxy(() => getAuth(getAdminApp()));
// 기존 코드에서 adminAuth.verifyIdToken(...) 형태를 그대로 쓸 수 있게 함

export const adminDb = createLazyProxy(() => getFirestore(getAdminApp()));
// 기존 코드에서 adminDb.collection(...) 형태를 그대로 쓸 수 있게 함