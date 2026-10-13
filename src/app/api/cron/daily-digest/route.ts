import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyStaff } from "@/lib/push";
import { authorizedCron } from "@/lib/cron-auth";
import { todayKST } from "@/lib/utils";
import { digestPush } from "@/lib/daily-digest";
import { loadOnlineStudyReminders } from "@/lib/online-study-reminder";

/**
 * 하루 요약 푸시. Vercel Cron 이 매일 21:00 KST 에 호출한다 (vercel.ts).
 * Vercel 은 CRON_SECRET 이 있으면 Authorization: Bearer <CRON_SECRET> 을 붙여 부른다.
 * 개강이 다가오는데 그 달 비대면 스터디가 안 열려 있으면 그 알림이 제목이 된다 (2026-10-13 — `daily-digest.ts`).
 */
export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const today = todayKST();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [study, homework, signups, reminders] = await Promise.all([
    admin.from("study_signups").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("homework_submissions").select("id", { count: "exact", head: true }).gte("created_at", since),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    loadOnlineStudyReminders(admin, today),
  ]);

  const counts = { study: study.count ?? 0, homework: homework.count ?? 0, signups: signups.count ?? 0 };
  const message = digestPush(counts, reminders, today);
  if (!message) return NextResponse.json({ ok: true, skipped: "no activity", counts });

  const result = await notifyStaff("daily_digest", message);
  return NextResponse.json({ ok: true, counts, reminders: reminders.length, result });
}
