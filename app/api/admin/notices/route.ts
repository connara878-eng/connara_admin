// app/api/admin/notices/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase.admin";

type NoticeDoc = {
  title: string;
  content: string;
  isActive: boolean;
  isPopup: boolean;
  showPopup: boolean;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

async function verifyAdminRequest(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    throw new Error("UNAUTHORIZED");
  }

  // 네 프로젝트에서 이미 관리자 판별 로직이 따로 있다면
  // 이 함수 안만 기존 방식으로 유지해도 됨.
  await adminAuth.verifyIdToken(token);
}

function normalizeIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("BAD_REQUEST");
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("BAD_REQUEST");
  }

  return date.toISOString();
}

function parsePriority(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(num)) {
    return 0;
  }

  return num;
}

function mapNoticeDoc(
  id: string,
  data: Partial<NoticeDoc> | undefined
) {
  return {
    id,
    title: data?.title ?? "",
    content: data?.content ?? "",
    isActive: Boolean(data?.isActive),
    isPopup:
      typeof data?.isPopup === "boolean"
        ? data.isPopup
        : Boolean(data?.showPopup),
    priority: typeof data?.priority === "number" ? data.priority : 0,
    startsAt: data?.startsAt ?? null,
    endsAt: data?.endsAt ?? null,
    createdAt: data?.createdAt ?? null,
    updatedAt: data?.updatedAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    await verifyAdminRequest(req);

    const snap = await adminDb.collection("notices").get();

    const notices = snap.docs
      .map((doc) =>
        mapNoticeDoc(doc.id, doc.data() as Partial<NoticeDoc> | undefined)
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;

        return updatedB - updatedA;
      });

    return NextResponse.json({
      ok: true,
      notices,
    });
  } catch (error) {
    console.error("[GET /api/admin/notices] failed:", error);

    return NextResponse.json(
      { ok: false, error: "공지 목록 조회 실패" },
      { status: 401 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await verifyAdminRequest(req);

    const body = await req.json();

    if (!body || typeof body !== "object") {
      throw new Error("BAD_REQUEST");
    }

    const title =
      typeof body.title === "string" ? body.title.trim() : "";

    const content =
      typeof body.content === "string" ? body.content.trim() : "";

    if (!title || !content) {
      throw new Error("BAD_REQUEST");
    }

    if (typeof body.isActive !== "boolean") {
      throw new Error("BAD_REQUEST");
    }

    const popupValue =
      typeof body.isPopup === "boolean"
        ? body.isPopup
        : typeof body.showPopup === "boolean"
        ? body.showPopup
        : null;

    if (popupValue === null) {
      throw new Error("BAD_REQUEST");
    }

    const isPopup = popupValue;
    const priority = parsePriority(body.priority);
    const startsAt = normalizeIsoOrNull(body.startsAt);
    const endsAt = normalizeIsoOrNull(body.endsAt);

    if (
      startsAt &&
      endsAt &&
      new Date(endsAt).getTime() <= new Date(startsAt).getTime()
    ) {
      throw new Error("BAD_REQUEST");
    }

    const now = new Date().toISOString();

    const payload: NoticeDoc = {
      title,
      content,
      isActive: body.isActive,
      isPopup,
      showPopup: isPopup,
      priority,
      startsAt,
      endsAt,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await adminDb.collection("notices").add(payload);

    return NextResponse.json({
      ok: true,
      id: ref.id,
    });
  } catch (error) {
    console.error("[POST /api/admin/notices] failed:", error);

    return NextResponse.json(
      { ok: false, error: "공지 저장 실패" },
      { status: 400 }
    );
  }
}