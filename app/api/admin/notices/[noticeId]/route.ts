// app/api/admin/notices/[noticeId]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase.admin";

type RouteContext = {
  params: Promise<{
    noticeId: string;
  }>;
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

async function resolveNoticeId(
  req: NextRequest,
  context: RouteContext
): Promise<string> {
  // 1차: Next.js params에서 noticeId 읽기
  const { noticeId } = await context.params;

  if (typeof noticeId === "string" && noticeId.trim()) {
    return noticeId.trim();
  }

  // 2차: 혹시 모를 상황 대비해서 URL 마지막 segment fallback
  const pathname = new URL(req.url).pathname;
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? "";
  const decoded = decodeURIComponent(lastSegment).trim();

  if (decoded && decoded !== "notices") {
    return decoded;
  }

  throw new Error("BAD_REQUEST");
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await verifyAdminRequest(req);

    const noticeId = await resolveNoticeId(req, context);

    const body = await req.json();

    if (!body || typeof body !== "object") {
      throw new Error("BAD_REQUEST");
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";

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

    const docRef = adminDb.collection("notices").doc(noticeId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "존재하지 않는 공지입니다." },
        { status: 404 }
      );
    }

    await docRef.update({
      title,
      content,
      isActive: body.isActive,
      isPopup,
      showPopup: isPopup,
      priority,
      startsAt,
      endsAt,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/admin/notices/[noticeId]] failed:", error);

    return NextResponse.json(
      { ok: false, error: "공지 저장 실패" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    await verifyAdminRequest(req);

    const noticeId = await resolveNoticeId(req, context);

    const docRef = adminDb.collection("notices").doc(noticeId);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "존재하지 않는 공지입니다." },
        { status: 404 }
      );
    }

    await docRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/admin/notices/[noticeId]] failed:", error);

    return NextResponse.json(
      { ok: false, error: "공지 삭제 실패" },
      { status: 400 }
    );
  }
}