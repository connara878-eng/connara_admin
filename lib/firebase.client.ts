"use client";

// lib/firebase.client.ts

// 클라이언트(브라우저)에서 쓰는 Firebase SDK 설정 파일
// - 관리자 로그인(Auth)
// - 관리자 페이지에서 이미지 업로드(Storage)
// 용도로 사용
//
// 주의:
// - 유저 정지/삭제/공지 생성 자체 권한 검증은 서버 API에서 해야 함
// - 여기서는 로그인과 파일 업로드 같은 "클라이언트 SDK 작업"만 담당

import { getApp, getApps, initializeApp } from "firebase/app";
// Firebase 앱 초기화 관련 함수들

import { getAuth } from "firebase/auth";
// 이메일/비밀번호 로그인, 현재 로그인 관리자 정보 확인 등에 사용

import { getStorage } from "firebase/storage";
// 공지 이미지 파일 업로드를 위해 Firebase Storage 인스턴스 생성

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  // Firebase 웹앱 API Key

  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  // Firebase Auth 도메인

  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  // Firebase 프로젝트 ID

  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  // Firebase Storage 버킷 이름
  // 파일 업로드 시 꼭 필요

  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  // Firebase 앱 ID
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
// 개발 모드 핫리로드 시 중복 초기화 방지
// 이미 앱이 있으면 재사용, 없으면 새로 생성

export const auth = getAuth(app);
// 로그인용 Auth 인스턴스

export const storage = getStorage(app);
// 파일 업로드용 Storage 인스턴스