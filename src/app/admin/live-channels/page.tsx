import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { requireStaff } from "@/lib/auth";
import { LIVE_MATCH_MINUTES } from "@/lib/live-detect";
import { createClient } from "@/lib/supabase/server";
import { youtubeConfigured } from "@/lib/youtube";
import { cn, formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";
import { disconnectYoutube } from "./actions";

export const metadata: Metadata = { title: "불라방 자동 연결", robots: { index: false } };

const ERROR_TEXT: Record<string, string> = {
  config: "아직 구글 설정이 안 끝났어요. 관리자가 아래 안내대로 설정하면 연결할 수 있어요.",
  denied: "구글 동의를 취소했어요. 다시 연결하려면 버튼을 눌러 주세요.",
  state: "연결 요청이 만료됐어요. 다시 눌러 주세요.",
  session: "로그인한 계정이 바뀌었어요. 다시 로그인한 뒤 연결해 주세요.",
  token: "구글에서 권한을 받지 못했어요. 다시 시도해 주세요.",
  no_refresh: "구글이 계속 쓸 권한을 주지 않았어요. 구글 계정 → 보안 → 타사 앱 액세스에서 이 사이트를 지운 뒤 다시 연결해 주세요.",
  no_channel: "이 구글 계정에 유튜브 채널이 없어요. 방송하는 채널의 계정(또는 브랜드 계정)으로 다시 연결해 주세요.",
  taken: "이 채널은 다른 강사님 계정에 이미 연결돼 있어요.",
  save: "저장하지 못했어요. 다시 시도해 주세요.",
};

const when = (iso: string | null) => (iso ? formatDate(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음");

/**
 * 유튜브 불라방 자동 연결 (2026-09-21 Alan — "두 강사가 각자 유튜브 채널에서 일부공개로 새 방송을 킬꺼야").
 * 강사마다 자기 채널을 한 번 연결하면, 수업 시작 ±10분에 켠 방송이 그 회차 불라방 링크로 저절로 들어간다.
 */
export default async function LiveChannelsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { user } = await requireStaff();
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const today = todayKST();
  const configured = youtubeConfigured();

  const [{ data: channels }, { data: staff }, { data: sessions }] = await Promise.all([
    // 토큰 칸은 읽지 않는다 (권한도 없다) — 상태 칸만
    supabase.from("youtube_channels").select("user_id, channel_id, channel_title, linked_at, last_checked_at, last_live_at, last_error, last_error_at"),
    supabase.from("profiles").select("id, name, role, subject").in("role", ["instructor", "admin"]).order("name"),
    supabase
      .from("session_dates")
      .select("id, seq, date, section:class_sections(id, track, time_block, recorded, instructor_id, course:courses(name, program)), session_live_links(source, updated_at)")
      .eq("date", today),
  ]);

  const mine = (channels ?? []).find((c) => c.user_id === user.id);
  const nameOf = new Map((staff ?? []).map((p) => [p.id, p.name]));
  // 링크를 두는 반 = 담당 강사가 있는 시간 단위 반 (묶음·속성반은 담당이 비어 있다 — 도메인 규칙 1)
  const todays = (sessions ?? [])
    .filter((s) => s.section && s.section.instructor_id)
    .sort((a, b) => (a.section!.time_block ?? "").localeCompare(b.section!.time_block ?? "") || (a.section!.course?.name ?? "").localeCompare(b.section!.course?.name ?? "", "ko"));

  return (
    <>
      <PageHeader
        icon="live"
        title="불라방 자동 연결"
        description={`강사님 유튜브 채널을 한 번 연결해 두면, 수업 시작 앞뒤 ${LIVE_MATCH_MINUTES}분 안에 켠 방송이 그 회차 불라방 링크로 저절로 들어가고 불라방 학생에게 바로 알림이 가요.`}
      />
      {ok && <Alert kind="success" className="mb-4">{ok === "linked" ? "유튜브 채널을 연결했어요." : "연결을 끊었어요."}</Alert>}
      {error && <Alert kind="warning" className="mb-4">{ERROR_TEXT[error] ?? "처리하지 못했어요."}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="mine-title" className="card p-5">
          <h2 id="mine-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="live" size={26} />내 유튜브 채널
          </h2>
          {mine ? (
            <div className="mt-3 space-y-3 text-sm">
              <p>
                <span className="font-black text-ink">{mine.channel_title || "이름 없는 채널"}</span>
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">연결됨</span>
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-surface px-3 py-2"><dt className="text-slate">연결한 날</dt><dd className="font-bold text-ink">{when(mine.linked_at)}</dd></div>
                <div className="rounded-lg bg-surface px-3 py-2"><dt className="text-slate">마지막 확인</dt><dd className="font-bold text-ink">{when(mine.last_checked_at)}</dd></div>
                <div className="col-span-2 rounded-lg bg-surface px-3 py-2"><dt className="text-slate">마지막으로 링크를 넣은 때</dt><dd className="font-bold text-ink">{when(mine.last_live_at)}</dd></div>
              </dl>
              {mine.last_error && <Alert kind="warning">{mine.last_error}</Alert>}
              <div className="flex flex-wrap gap-2">
                {configured && (
                  <a href="/api/youtube/connect" className="btn-secondary !py-2 text-sm">다시 연결</a>
                )}
                <form action={disconnectYoutube}>
                  <button type="submit" className="btn-ghost !py-2 text-sm text-red-700">연결 끊기</button>
                </form>
              </div>
            </div>
          ) : configured ? (
            <div className="mt-3 space-y-3 text-sm text-slate">
              <p>방송하는 유튜브 채널의 구글 계정으로 한 번만 연결하면 돼요. 방송 목록을 <b className="text-ink">읽기만</b> 하고, 영상을 올리거나 지우지 않아요.</p>
              <a href="/api/youtube/connect" className="btn-primary">
                <Icon name="live" size={18} />
                유튜브 채널 연결
              </a>
              <p className="text-xs">구글이 &ldquo;확인되지 않은 앱&rdquo; 경고를 띄우면 &ldquo;고급 → 이동&rdquo;을 누르면 돼요 (우리 사이트 전용 앱이라 그래요).</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate">아직 구글 설정이 안 끝나 연결할 수 없어요. 관리자가 아래 &ldquo;관리자 설정&rdquo;을 마치면 버튼이 나와요.</p>
          )}
        </section>

        <section aria-labelledby="how-title" className="card p-5">
          <h2 id="how-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="bolt" size={26} />이렇게 돼요
          </h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate">
            <li>OBS·프리즘으로 <b className="text-ink">내 채널에 일부공개</b> 방송을 켠다 — <b className="text-ink">교시마다 새 방송</b>으로.</li>
            <li>방송 시작이 수업 시작 앞뒤 {LIVE_MATCH_MINUTES}분 안이면 30초 안에 그 회차 불라방 링크로 들어간다 (내가 담당인 반).</li>
            <li>그 순간 그 시간을 듣는 불라방 학생에게 &ldquo;불라방이 시작됐어요&rdquo; 알림이 가고, 나에게도 확인 알림이 온다.</li>
            <li>오전반은 수업이 끝나면 같은 주소가 그 회차 다시보기가 된다. 저녁 화목금 인강 학생도 이 녹화본을 본다.</li>
          </ol>
          <p className="mt-3 text-xs text-slate">
            창을 벗어나 켰거나 한 방송으로 두 교시를 이어 가면 자동으로 안 들어가요. 그때는 반 상세의 회차 표에 링크를 직접 넣으면 돼요 (넣는 순간 학생 알림이 가요).
          </p>
        </section>

        <section aria-labelledby="today-title" className="card p-5 lg:col-span-2">
          <h2 id="today-title" className="text-lg font-black text-ink">오늘 회차 ({formatDate(today, { month: "long", day: "numeric", weekday: "short" })})</h2>
          {todays.length === 0 ? (
            <p className="mt-3 text-sm text-slate">오늘은 수업이 없어요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {todays.map((s) => {
                const sec = s.section!;
                const link = Array.isArray(s.session_live_links) ? s.session_live_links[0] : s.session_live_links;
                const connected = (channels ?? []).some((c) => c.user_id === sec.instructor_id);
                const state = sec.recorded
                  ? { text: "인강 — 방송 없음", cls: "bg-violet-100 text-violet-800" }
                  : link
                    ? link.source === "youtube"
                      ? { text: `자동 연결 ${when(link.updated_at)}`, cls: "bg-ink text-white" }
                      : { text: "직접 넣음", cls: "bg-brand-100 text-brand-700" }
                    : connected
                      ? { text: "방송을 기다리는 중", cls: "bg-amber-100 text-amber-800" }
                      : { text: "채널 미연결", cls: "bg-line text-slate" };
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">
                        {sec.time_block} · {sec.course?.name ?? "강좌"} {TRACK_LABEL[sec.track] ?? sec.track} · {s.seq}회차
                      </p>
                      <p className="text-xs text-slate">담당 {nameOf.get(sec.instructor_id!) ?? "-"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", state.cls)}>{state.text}</span>
                      <Link href={`/admin/sections/${sec.id}`} className="text-xs font-bold text-brand-600 hover:underline">반 상세</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="staff-title" className="card p-5">
          <h2 id="staff-title" className="text-lg font-black text-ink">강사님 연결 상태</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {(staff ?? [])
              .filter((p) => p.role === "instructor")
              .map((p) => {
                const c = (channels ?? []).find((x) => x.user_id === p.id);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="font-bold text-ink">
                      {p.name} <span className="text-xs font-normal text-slate">{p.subject?.toUpperCase()}</span>
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", c ? (c.last_error ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800") : "bg-line text-slate")}>
                      {c ? (c.last_error ? "확인 필요" : c.channel_title || "연결됨") : "미연결"}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>

        <section aria-labelledby="setup-title" className="card p-5">
          <h2 id="setup-title" className="text-lg font-black text-ink">관리자 설정 (한 번만)</h2>
          <p className="mt-1 text-sm text-slate">{configured ? "구글 설정이 되어 있어요." : "아직 안 됐어요. 구글 클라우드에서 한 번만 하면 돼요."}</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate">
            <li>Google Cloud Console 에서 프로젝트를 고르고 <b>YouTube Data API v3</b> 를 사용 설정한다.</li>
            <li>OAuth 동의 화면: 외부 · 범위에 <code>youtube.readonly</code> · <b>게시(프로덕션)</b> 상태로 — 테스트 상태면 7일 뒤 연결이 끊긴다.</li>
            <li>사용자 인증 정보 → OAuth 클라이언트 ID(웹) → 승인된 리디렉션 URI 에 <code>https://winnertoeic.com/api/youtube/callback</code>.</li>
            <li>Vercel 환경변수 <code>YOUTUBE_CLIENT_ID</code> · <code>YOUTUBE_CLIENT_SECRET</code> 에 넣고 다시 배포한다.</li>
          </ol>
        </section>
      </div>
    </>
  );
}
