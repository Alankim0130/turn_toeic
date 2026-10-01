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

/**
 * 유튜브 자동 연결 (2026-09-21 Alan → 2026-10-01 Alan — "쌤들이 Zoom으로 수업을 하되, 유튜브 자동연결을 통해서 미공개로 송출 …
 * 해당 유튜브 링크를 자동으로 다시보기란으로 넣어줄 수 있을까? … 쌤들이 해야할 순서를 하나씩 업로드해주면 좋겠어").
 *
 * 강사마다 자기 채널을 한 번 연결하면, Zoom 이 유튜브로 함께 송출한 방송(수업 시작 ±10분에 시작)이 그 회차에 걸리고
 * 수업이 끝나면 그 회차 다시보기로 올라간다. **불라방 입장 링크(Zoom)와 학생 알림은 건드리지 않는다** — 도메인 규칙 1.
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
        "id, seq, date, section:class_sections(id, track, time_block, recorded, live_to_replay, instructor_id, course:courses(name, program)), session_streams(detected_at, promoted_at), replays(id)",
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
        description={`Zoom 수업을 유튜브로 함께 송출(일부 공개)하면, 수업이 끝난 뒤 그 영상이 그 회차 다시보기로 저절로 올라가요. 강사님 유튜브 채널을 한 번만 연결해 두면 돼요 (방송 시작이 수업 시작 앞뒤 ${LIVE_MATCH_MINUTES}분 안일 때).`}
      />
      {/* 2026-09-30 Alan — "불라방은 zoom으로 올리고, 다시보기는 유튜브로" → 2026-10-01 Zoom 의 유튜브 송출을 찾아 다시보기로 */}
      <Alert kind="info" className="mb-4" title="불라방 입장은 Zoom, 다시보기는 유튜브 송출로">
        입장 링크는 <Link href="/admin/live" className="font-bold text-brand-600 hover:underline">불라방 링크</Link> 화면에서 넣어요. 이 화면은 Zoom 의 「YouTube에서 라이브」로
        함께 송출한 방송을 찾아 <b className="text-ink">다시보기</b>에 올리는 곳이에요 — 불라방 링크와 학생 알림은 건드리지 않아요.
      </Alert>
      {ok && <Alert kind="success" className="mb-4">{ok === "linked" ? "유튜브 채널을 연결했어요. 아래 「지금 내 방송 확인」으로 바로 테스트해 볼 수 있어요." : "연결을 끊었어요."}</Alert>}
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
                <b className="text-ink">방송하는 유튜브 채널의 구글 계정</b>으로 한 번만 연결하면 돼요 — Zoom 에서 「YouTube에서 라이브」를 켤 때 로그인하는 바로 그 계정이에요.
                방송 목록을 <b className="text-ink">읽기만</b> 하고, 영상을 올리거나 지우지 않아요.
              </p>
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
            <li>학생은 <b className="text-ink">불라방 링크</b>에 넣어 둔 Zoom 으로 들어온다 — 지금과 같다.</li>
            <li>선생님은 Zoom 에서 <b className="text-ink">「YouTube에서 라이브」</b>로 내 채널에 <b className="text-ink">일부 공개</b> 송출을 켠다 — <b className="text-ink">교시마다 새로</b>.</li>
            <li>송출 시작이 수업 시작 앞뒤 {LIVE_MATCH_MINUTES}분 안이면 30초 안에 그 회차(내가 담당인 반)에 걸리고, 나에게 확인 알림이 온다. 학생 알림은 가지 않는다.</li>
            <li>수업이 끝나면 그 영상이 <b className="text-ink">그 회차 다시보기</b>에 올라간다 (끝나고 10분 안). 저녁 인강·현장 학생도 이 녹화본을 본다.</li>
          </ol>
          <p className="mt-3 text-xs text-slate">
            저녁 반처럼 &ldquo;끝나면 다시보기로&rdquo; 가 꺼진 반은 송출해도 다시보기를 만들지 않아요 (반 상세의 스위치).
          </p>
        </section>

        <section aria-labelledby="steps-title" className="card p-5 lg:col-span-2">
          <h2 id="steps-title" className="flex items-center gap-2 text-lg font-black text-ink">
            <Icon name="replay" size={26} />선생님이 하실 순서
          </h2>
          <p className="mt-1 text-sm text-slate">본인 노트북에서 <b className="text-ink">본인 유튜브 계정</b>으로 하면 돼요. 1~3은 한 번만, 4~6은 수업마다예요.</p>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-black text-brand-600">준비 — 한 번만</h3>
              <ol className="mt-2 space-y-3 text-sm text-slate">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">1</span>
                  <div>
                    <p className="font-bold text-ink">유튜브에서 실시간 스트리밍 사용 설정</p>
                    <p className="mt-0.5">
                      <Ext href="https://studio.youtube.com/">YouTube 스튜디오</Ext> → 오른쪽 위 <b className="text-ink">만들기 → 실시간 스트리밍 시작</b> → 휴대폰 인증.
                      <b className="text-ink"> 처음 켜면 24시간 뒤부터</b> 방송할 수 있어요 — 수업 전날까지 해 두세요.
                      (스튜디오 설정 → 채널 → 기능 사용 자격요건에서 &ldquo;실시간 스트리밍&rdquo; 이 사용 설정이면 끝난 거예요.)
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">2</span>
                  <div>
                    <p className="font-bold text-ink">이 화면에서 유튜브 채널 연결</p>
                    <p className="mt-0.5">
                      위 「내 유튜브 채널」의 <b className="text-ink">유튜브 채널 연결</b> 버튼 → 1번의 그 구글 계정으로 로그인 → 허용.
                      채널이 여러 개면(브랜드 계정) 방송할 채널을 고르세요. 연결되면 <b className="text-ink">지금 내 방송 확인</b> 버튼이 생겨요.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-black text-white">3</span>
                  <div>
                    <p className="font-bold text-ink">Zoom 에서 라이브 스트리밍 허용</p>
                    <p className="mt-0.5">
                      <Ext href="https://zoom.us/profile/setting">Zoom 웹 설정</Ext> → <b className="text-ink">회의</b> 탭 → <b className="text-ink">회의 중(고급)</b> →
                      <b className="text-ink"> 회의 라이브 스트리밍 허용</b>(Allow livestreaming of meetings) 켜고 <b className="text-ink">YouTube</b> 체크.
                      유료(Pro 이상) Zoom 계정에서만 돼요. 학원 계정이 잠겨 있으면 Zoom 관리자가 켜 줘야 해요.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
            <div>
              <h3 className="text-sm font-black text-brand-600">수업마다</h3>
              <ol className="mt-2 space-y-3 text-sm text-slate">
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-black text-white">4</span>
                  <div>
                    <p className="font-bold text-ink">Zoom 회의를 열고, 시작 {LIVE_MATCH_MINUTES}분 전 ~ {LIVE_MATCH_MINUTES}분 뒤 사이에 송출 켜기</p>
                    <p className="mt-0.5">
                      Zoom 아래 도구 모음 <b className="text-ink">더 보기(…) → YouTube에서 라이브</b> → 2번의 그 구글 계정 선택 → 제목 입력 →
                      공개 범위 <b className="text-ink">일부 공개(Unlisted)</b> → <b className="text-ink">YouTube에서 라이브 시작</b>.
                      브라우저가 한 번 열렸다 닫히고 Zoom 에 &ldquo;LIVE&rdquo; 표시가 뜨면 송출 중이에요.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-black text-white">5</span>
                  <div>
                    <p className="font-bold text-ink">잡혔는지 확인</p>
                    <p className="mt-0.5">
                      30초쯤 뒤 휴대폰에 &ldquo;유튜브 송출을 찾았어요&rdquo; 알림이 오고 (알림 설정의 <b className="text-ink">내 유튜브 자동 연결</b>),
                      아래 「오늘 회차」 그 줄이 <b className="text-ink">송출 잡힘</b>으로 바뀌어요. 안 바뀌면 「지금 내 방송 확인」으로 방송이 보이는지부터 보세요.
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-black text-white">6</span>
                  <div>
                    <p className="font-bold text-ink">교시가 끝나면 송출 끄기, 다음 교시는 새로 켜기</p>
                    <p className="mt-0.5">
                      <b className="text-ink">더 보기(…) → 라이브 스트림 중지</b>(회의를 끝내도 꺼져요). 다음 교시는 4번부터 다시 —
                      <b className="text-ink"> 한 송출로 두 교시를 이으면 뒤 교시는 안 잡혀요.</b> 수업이 끝나면 10분 안에 다시보기에 올라가요.
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <p className="font-black">잘 안 될 때</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>송출을 {LIVE_MATCH_MINUTES}분 넘게 늦게 켰거나 끊겨서 다시 켠 두 번째 방송은 안 잡혀요 → 수업 뒤 YouTube 스튜디오 → 콘텐츠 → 실시간 스트리밍에서 그 영상 주소를 복사해 <Link href="/admin/replays" className="font-bold underline">다시보기 등록</Link>에서 붙여 주세요.</li>
              <li>다른 구글 계정으로 송출하면 안 잡혀요 — Zoom 의 YouTube 로그인과 이 화면의 연결이 <b>같은 계정</b>이어야 해요.</li>
              <li>공개로 켰으면 알림에 ⚠ 가 붙어요 → 유튜브에서 일부 공개로 바꾸면 돼요 (주소는 그대로라 다시보기도 그대로예요).</li>
              <li>유튜브는 방송이 끝난 뒤 녹화본을 몇 분 처리해요 — 다시보기에 올라왔는데 바로 안 열리면 잠시 뒤 다시 열어 보세요.</li>
            </ul>
          </div>
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
            <li><Ext href="https://console.cloud.google.com/">Google Cloud Console</Ext> 에서 프로젝트를 고르고 <b>YouTube Data API v3</b> 를 사용 설정한다.</li>
            <li>OAuth 동의 화면: 외부 · 범위에 <code>youtube.readonly</code> · <b>게시(프로덕션)</b> 상태로 — 테스트 상태면 강사 구글 계정을 테스트 사용자에 넣어야 연결되고 7일 뒤 끊긴다.</li>
            <li>사용자 인증 정보 → OAuth 클라이언트 ID(웹) → 승인된 리디렉션 URI 에 <code>https://winnertoeic.com/api/youtube/callback</code>.</li>
            <li>Vercel 환경변수 <code>YOUTUBE_CLIENT_ID</code> · <code>YOUTUBE_CLIENT_SECRET</code> 에 넣고 다시 배포한다.</li>
          </ol>
        </section>
      </div>
    </>
  );
}
