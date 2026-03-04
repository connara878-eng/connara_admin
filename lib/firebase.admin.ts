// lib/firebase.admin.ts

// 서버(API Route)에서만 쓰는 Firebase Admin SDK 설정 파일
// - 관리자 권한으로 Firebase Auth / Firestore 작업 처리
// - 이 파일은 절대 클라이언트 컴포넌트에서 import 하면 안 됨
// - 빌드 시점에 환경변수 누락으로 바로 터지는 걸 줄이기 위해
//   "필요할 때 초기화"하는 구조로 작성
// - 기존 코드 호환을 위해
//   adminAuth / adminDb 이름도 그대로 export 해줌
// - 단, notices 같은 민감한 라우트에서는 getAdminAuth()/getAdminDb() 직접 호출을 권장

import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
// Firebase Admin 앱 초기화 관련 함수들

import { getAuth, type Auth } from "firebase-admin/auth";
// 관리자 권한 Auth 인스턴스 생성 함수

import { getFirestore, type Firestore } from "firebase-admin/firestore";
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

function getAdminApp(): App {
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

export function getAdminAuth(): Auth {
  // 함수형으로 Auth 인스턴스를 가져오고 싶을 때 사용
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  // 함수형으로 Firestore 인스턴스를 가져오고 싶을 때 사용
  return getFirestore(getAdminApp());
}

// -------------------------------------------------------------------
// 기존 코드 호환용 lazy export
// -------------------------------------------------------------------
// 예전 코드가 import { adminAuth, adminDb } 형태를 그대로 써도
// 동작할 수 있게 lazy getter 형태의 proxy를 만든다.
// 단, 메서드 호출 시 this 바인딩이 깨지지 않게 bind 처리한다.

function createLazyProxy<T extends object>(factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = factory() as Record<string, unknown>;
      const value = real[prop as keyof typeof real];

      if (typeof value === "function") {
        return (value as Function).bind(real);
      }

      return value;
    },

    set(_target, prop, value) {
      const real = factory() as Record<string, unknown>;
      real[prop as keyof typeof real] = value;
      return true;
    },

    has(_target, prop) {
      const real = factory() as Record<string, unknown>;
      return prop in real;
    },

    ownKeys() {
      const real = factory() as Record<string, unknown>;
      return Reflect.ownKeys(real);
    },

    getOwnPropertyDescriptor(_target, prop) {
      const real = factory() as Record<string, unknown>;
      return Object.getOwnPropertyDescriptor(real, prop);
    },
  });
}

export const adminAuth = createLazyProxy<Auth>(() => getAdminAuth());
// 기존 코드에서 adminAuth.verifyIdToken(...) 형태를 그대로 쓸 수 있게 함

export const adminDb = createLazyProxy<Firestore>(() => getAdminDb());
// 기존 코드에서 adminDb.collection(...) 형태를 그대로 쓸 수 있게 함