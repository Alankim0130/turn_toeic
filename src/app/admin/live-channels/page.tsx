import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/components/ui/Icon";
import { BroadcastCheck } from "@/components/admin/live-channels/BroadcastCheck";
import { requireStaff } from "@/lib/auth";
import { LIVE_MATCH_MINUTES, streamState, type StreamTone } from "@/lib/live-detect";
import { createClient } from "@/lib/supabase/server";
import { youtubeConfigured } from "@/lib/youtube";
import { cn, formatDate, todayKST, TRACK_LABEL } from "@/lib/utils";
import { disconnectYoutube } from "./actions";

export const metadata: Metadata = { title: "유튜브 자동 연결", robots: { index: false } };

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

const TONE: Record<StreamTone, string> = {
  recorded: "bg-violet-100 text-violet-800",
  muted: "bg-line text-slate",
  wait: "bg-amber-100 text-amber-800",
  caught: "bg-ink text-white",
  done: "bg-brand-500 text-white",
  manual: "bg-brand-100 text-brand-700",
};

const when = (iso: string | null) => (iso ? formatDate(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음");
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** 선생님 안내의 바깥 링크 — 새 창, 밑줄 (누르면 무언가 일어나는 값에는 밑줄을 남긴다) */
function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-bold text-brand-600 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
      {children}
    </a>
  );
}

/** 순서 한 줄 — 번호 동그라미 + 제목 + 설명. `done` 이면 번호 대신 체크, 제목 옆에 `완료` */
function Step({ n, title, done = false, dark = false, children }: { n: number; title: string; done?: boolean; dark?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white", done ? "bg-emerald-500" : dark ? "bg-ink" : "bg-brand-500")}>
        {done ? (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : (
          n
        )}
      </span>
      <div className={cn(done && "text-mist")}>
        <p className={cn("font-bold", done ? "text-slate" : "text-ink")}>
          {title}
          {done && <span className="ml-2 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">완료</span>}
        </p>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  );
}

/**
 * 유튜브 자동 연결 (2026-09-21 Alan → 2026-10-01 Alan — "쌤들이 Zoom으로 수업을 하되, 유튜브 자동연결을 통해서 미공개로 송출 …
 * 해당 유튜브 링크를 자동으로 다시보기란으로 넣어줄 수 있을까? … 쌤들이 해야할 순서를 하나씩 업로드해주면 좋겠어"
 * → 같은 날 키를 넣은 뒤 "이미 설정한 것들, 즉 필요없는 것들은 전부 없애줘").
 *
 * 강사마다 자기 채널을 한 번 연결하면, Zoom 이 유튜브로 함께 송출한 방송(수업 시작 ±10분에 시작)이 그 회차에 걸리고
 * 수업이 끝나면 그 회차 다시보기로 올라간다. **불라방 입장 링크(Zoom)와 학생 알림은 건드리지 않는다** — 도메인 규칙 1.
 * 화면은 넷뿐이다 — 내 채널 · 강사님 연결 상태 · 선생님이 하실 순서 · 오늘 회차. 관리자 설정(구글 키) 안내는 **키가 없을 때만** 뜬다.
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
      .select(
        "id, seq, date, section:class_sections(id, track, time_block, recorded, live_to_replay, instructor_id, course:courses(name, program)), session_streams(detected_at, promoted_at), session_live_links(source), replays(id)",
      )
      .eq("date", today),
  ]);

  const mine = (channels ?? []).find((c) => c.user_id === user.id);
  const nameOf = new Map((staff ?? []).map((p) => [p.id, p.name]));
  // 송출을 거는 반 = 담당 강사가 있는 시간 단위 반 (묶음·속성반은 담당이 비어 있다 — 도메인 규칙 1)
  const todays = (sessions ?? [])
    .filter((s) => s.section && s.section.instructor_id)
    .sort((a, b) => (a.section!.time_block ?? "").localeCompare(b.section!.time_block ?? "") || (a.section!.course?.name ?? "").localeCompare(b.section!.course?.name ?? "", "ko"));

  return (
    <>
      <PageHeader
        icon="live"
        title="유튜브 자동 연결"
        description="Zoom 수업을 유튜브로 함께 송출하면, 잡힌 주소가 그 회차 불라방 링크로 들어가고(비워 둔 칸만) 수업이 끝난 뒤에는 다시보기로 올라가요."
      />
      {ok && <Alert kind="success" className="mb-4">{ok === "linked" ? "유튜브 채널을 연결했어요. 「지금 내 방송 확인」으로 바로 테스트해 볼 수 있어요." : "연결을 끊었어요."}</Alert>}
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
                <div className="col-span-2 rounded-lg bg-surface px-3 py-2"><dt className="text-slate">마지막으로 송출을 잡은 때</dt><dd className="font-bold text-ink">{when(mine.last_live_at)}</dd></div>
              </dl>
              {mine.last_error && <Alert kind="warning">{mine.last_error}</Alert>}
              <BroadcastCheck />
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
              <p>
                Zoom 에서 「YouTube에서 라이브」를 켤 때 로그인하는 <b className="text-ink">바로 그 구글 계정</b>으로 한 번만 연결하면 돼요. 방송 목록을 읽기만 하고 영상을 올리거나 지우지 않아요.
              </p>
              <a href="/api/youtube/connect" className="btn-primary">
                <Icon name="live" size={18} />
                유튜브 채널 연결
              </a>
              <p className="text-xs">구글이 &ldquo;확인되지 않은 앱&rdquo; 경고를 띄우면 &ldquo;고급 → 이동&rdquo;을 누르면 돼요.</p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate">아직 구글 설정이 안 끝나 연결할 수 없어요. 관리자가 아래 &ldquo;관리자 설정&rdquo;을 마치면 버튼이 나와요.</p>
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
          <p className="mt-3 text-xs text-slate">선생님마다 본인 계정으로 로그인해 본인 채널을 연결해요. 방송은 그 반의 담당 강사 채널에서만 찾아요.</p>
        </section>

        <section aria-labelledby="steps-title" className="card p-5 lg:col-span-2">
          <h2 id="steps-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="replay" size={26} />선생님이 하실 순서
          </h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-black text-brand-600">준비 — 한 번만</h3>
              <ol className="mt-2 space-y-3 text-sm text-slate">
                <Step n={1} title="유튜브에서 실시간 스트리밍 사용 설정">
                  <Ext href="https://studio.youtube.com/">YouTube 스튜디오</Ext> → <b className="text-ink">만들기 → 실시간 스트리밍 시작</b> → 휴대폰 인증.
                  <b className="text-ink"> 처음 켜면 24시간 뒤부터</b> 방송할 수 있어요 — 수업 전날까지 해 두세요.
                </Step>
                <Step n={2} title="이 화면에서 유튜브 채널 연결" done={!!mine}>
                  위 「내 유튜브 채널」의 <b className="text-ink">유튜브 채널 연결</b> 버튼 → 1번의 구글 계정으로 로그인 → 허용.
                </Step>
                <Step n={3} title="Zoom 에서 라이브 스트리밍 허용">
                  <Ext href="https://zoom.us/profile/setting">Zoom 웹 설정</Ext> → <b className="text-ink">회의</b> 탭 → <b className="text-ink">회의 중(고급)</b> →
                  <b className="text-ink"> 회의 라이브 스트리밍 허용</b> 켜고 <b className="text-ink">YouTube</b> 체크. 유료(Pro 이상) Zoom 계정에서만 돼요.
                </Step>
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-black text-brand-600">수업마다</h3>
              <ol className="mt-2 space-y-3 text-sm text-slate">
                <Step n={4} dark title={`수업 시작 ${LIVE_MATCH_MINUTES}분 전 ~ ${LIVE_MATCH_MINUTES}분 뒤 사이에 송출 켜기`}>
                  Zoom <b className="text-ink">더 보기(…) → YouTube에서 라이브</b> → 제목 입력 → 공개 범위 <b className="text-ink">일부 공개</b> → <b className="text-ink">YouTube에서 라이브 시작</b>.
                </Step>
                <Step n={5} dark title="30초 뒤 알림이 오면 잡힌 것">
                  휴대폰에 &ldquo;유튜브 송출을 찾았어요&rdquo; 알림이 오고 아래 「오늘 회차」가 <b className="text-ink">송출 잡힘</b>으로 바뀌어요.
                  불라방 링크를 비워 뒀다면 그 주소가 <b className="text-ink">불라방 링크로도 들어가</b> 학생에게 &ldquo;불라방이 시작됐어요&rdquo; 알림이 가요 — Zoom 링크를 넣어 둔 교시는 그대로예요.
                  안 바뀌면 「지금 내 방송 확인」부터 눌러 보세요.
                </Step>
                <Step n={6} dark title="교시가 끝나면 송출 끄기, 다음 교시는 새로 켜기">
                  <b className="text-ink">더 보기(…) → 라이브 스트림 중지</b>. 한 송출로 두 교시를 이으면 뒤 교시는 안 잡혀요. 수업이 끝나면 10분 안에 다시보기에 올라가요.
                </Step>
              </ol>
            </div>
          </div>

          <details className="group mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <summary className="cursor-pointer list-none font-black">
              잘 안 될 때 <span className="font-normal text-amber-800">(눌러서 펼치기)</span>
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>송출을 {LIVE_MATCH_MINUTES}분 넘게 늦게 켰거나 끊겨서 다시 켠 두 번째 방송은 안 잡혀요 → YouTube 스튜디오 → 콘텐츠 → 실시간 스트리밍에서 영상 주소를 복사해 <Link href="/admin/replays" className="font-bold underline">다시보기 등록</Link>에서 붙여 주세요.</li>
              <li>Zoom 의 YouTube 로그인과 이 화면의 연결이 <b>같은 구글 계정</b>이어야 해요.</li>
              <li>학생을 Zoom 으로 들이고 싶은 교시는 <Link href="/admin/live" className="font-bold underline">불라방 링크</Link>에 Zoom 주소를 먼저 넣어 두세요 — 넣어 둔 링크는 덮어쓰지 않아요. 비워 두면 유튜브 송출 주소가 들어가요.</li>
              <li>공개로 켰으면 알림에 ⚠ 가 붙어요 → 유튜브에서 일부 공개로 바꾸면 돼요 (주소는 그대로).</li>
              <li>저녁 반처럼 &ldquo;끝나면 다시보기로&rdquo; 가 꺼진 반은 송출해도 다시보기를 만들지 않아요 (반 상세의 스위치).</li>
            </ul>
          </details>
        </section>

        <section aria-labelledby="today-title" className="card p-5 lg:col-span-2">
          <h2 id="today-title" className="text-lg font-black text-ink">오늘 회차 ({formatDate(today, { month: "long", day: "numeric", weekday: "short" })})</h2>
          {todays.length === 0 ? (
            <p className="mt-3 text-sm text-slate">오늘은 수업이 없어요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {todays.map((s) => {
                const sec = s.section!;
                const stream = one(s.session_streams);
                const state = streamState({
                  recorded: sec.recorded,
                  liveToReplay: sec.live_to_replay,
                  stream,
                  hasReplay: (s.replays?.length ?? 0) > 0,
                  connected: (channels ?? []).some((c) => c.user_id === sec.instructor_id),
                  liveLinked: one(s.session_live_links)?.source === "youtube",
                });
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-ink">
                        {sec.time_block} · {sec.course?.name ?? "강좌"} {TRACK_LABEL[sec.track] ?? sec.track} · {s.seq}회차
                      </p>
                      <p className="text-xs text-slate">담당 {nameOf.get(sec.instructor_id!) ?? "-"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", TONE[state.tone])}>
                        {state.text}
                        {state.at ? ` ${when(state.at)}` : ""}
                      </span>
                      <Link href={`/admin/replays?section=${sec.id}`} className="text-xs font-bold text-brand-600 hover:underline">다시보기</Link>
                      <Link href={`/admin/sections/${sec.id}`} className="text-xs font-bold text-brand-600 hover:underline">반 상세</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 구글 키가 없을 때만 — 설정이 끝나면 보일 이유가 없다 (2026-10-01 Alan "이미 설정한 것들은 전부 없애줘") */}
        {!configured && (
          <section aria-labelledby="setup-title" className="card p-5 lg:col-span-2">
            <h2 id="setup-title" className="text-lg font-black text-ink">관리자 설정 (한 번만)</h2>
            <p className="mt-1 text-sm text-slate">아직 구글 키가 없어요. 구글 클라우드에서 한 번만 하면 돼요.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate">
              <li><Ext href="https://console.cloud.google.com/">Google Cloud Console</Ext> 에서 프로젝트를 고르고 <b>YouTube Data API v3</b> 를 사용 설정한다.</li>
              <li>
                OAuth 동의 화면(Google Auth Platform): 외부 · 데이터 액세스의 범위에 <code>https://www.googleapis.com/auth/youtube.readonly</code> ·
                브랜딩에 앱 이름 <code>역전토익</code> · 홈페이지 <code>https://winnertoeic.com</code> · 개인정보처리방침 <code>https://winnertoeic.com/privacy</code> ·
                승인된 도메인 <code>winnertoeic.com</code> (로고는 올리지 않는다 — 올리면 구글 심사가 붙는다) · 대상에서 <b>앱 게시(프로덕션)</b>.
              </li>
              <li>사용자 인증 정보 → OAuth 클라이언트 ID(웹) → 승인된 리디렉션 URI 에 <code>https://winnertoeic.com/api/youtube/callback</code>.</li>
              <li>Vercel 환경변수 <code>YOUTUBE_CLIENT_ID</code> · <code>YOUTUBE_CLIENT_SECRET</code> 에 넣고 다시 배포한다.</li>
            </ol>
          </section>
        )}
      </div>
    </>
  );
}
