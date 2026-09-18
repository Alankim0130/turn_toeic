import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";

/** 비밀 비교는 길이·내용을 한 번에 — 글자 하나씩 비교하면 응답 시간으로 비밀을 알아낼 수 있다 (네이버 웹훅과 같은 방식) */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * 하루 요약 푸시. Vercel Cron 이 매일 21:00 KST 에 호출한다 (vercel.ts).
 * Vercel 은 CRON_SECRET 이 있으면 Authorization: Bearer <CRON_SECRET> 을 붙여 부른다.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [study, homework, signups] = await Promise.all([
    admin.from("study_signups").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("homework_submissions").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);

  const counts = { study: study.count ?? 0, homework: homework.count ?? 0, signups: signups.count ?? 0 };
  if (counts.study + counts.homework + counts.signups === 0) {
    return NextResponse.json({ ok: true, skipped: "no activity", counts });
  }

  const result = await notifyStaff("daily_digest", {
    title: "오늘의 역전토익 요약",
    body: `스터디 신청 ${counts.study}건 · 숙제업로드 ${counts.homework}건 · 신규 가입 ${counts.signups}명`,
    url: "/admin",
    tag: "daily-digest",
  });
  return NextResponse.json({ ok: true, counts, result });
}
