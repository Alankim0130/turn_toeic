import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { InstallApp } from "@/components/pwa/InstallApp";
import { MonthSchedule } from "@/components/my/MonthSchedule";
import { AttendanceRate } from "@/components/my/AttendanceRate";
import { ProfilePhoto } from "@/components/layout/ProfilePhoto";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { cn, formatDate, formatTimeRange, MODE_LABEL, RECORDED_LABEL, TRACK_LABEL } from "@/lib/utils";
import { initialMonth } from "@/lib/class-day";
import { profilePhotoUrl } from "@/lib/avatar";
import { orderPhase } from "@/lib/enrollment-window";
import { heldMonth } from "@/lib/verify-decision";
import { collapseWeek5, pairKey, studentTrackLabel, type Week5Section } from "@/lib/week5";
import { getMySchedule } from "./_lib/schedule";
import {
  getMyVerifications,
  monthOf,
  ORDER_STATUS_LABEL,
  termLabel,
  VERIFICATION_STATUS_LABEL,
  getMyWeek5,
  getMyMergeRequests,
  getUnreadMessageCount,
} from "./_lib/queries";

export const metadata: Metadata = {
  title: "마이페이지",
  robots: { index: false },
};

const QUICK: { href: string; label: string; desc: string; icon: IconName }[] = [
  { href: "/my/verify", label: "등업신청", desc: "수강증 올리기", icon: "verify" },
  { href: "/my/class", label: "내 시간표", desc: "수업일 확인", icon: "calendar" },
  { href: "/my/lecture", label: "특강신청", desc: "특강·모의고사", icon: "bolt" },
  { href: "/my/live", label: "불라방", desc: "실시간 입장", icon: "live" },
  { href: "/my/textbook", label: "교재주문", desc: "불라방 교재 배송", icon: "textbook" },
  { href: "/my/replay", label: "다시보기", desc: "종강일까지 시청", icon: "replay" },
  // 두 칸은 서로 다른 일이다 — 비대면 인증은 내 스터디, 정규 수업 숙제는 숙제업로드 (2026-09-23 Alan)
  { href: "/my/study", label: "내 스터디", desc: "신청 · 자료 · 인증", icon: "study" },
  { href: "/my/homework", label: "숙제업로드", desc: "수업 숙제 사진", icon: "homework" },
  { href: "/my/lc-audio", label: "LC음원듣기", desc: "레벨별 음원", icon: "headphones" },
  { href: "/my/notifications", label: "알림", desc: "선생님 안내 · 수업 시작", icon: "bell" },
];
// `내 계정`(/my/account) 은 바로가기에 두지 않는다 (2026-09-19 Alan) — 이름·전화번호 확인과
// 계정 합치기는 등업 흐름(/my/verify) 안에서 한다. 그 페이지는 **반대쪽 계정이 합치기를 확인할 때만**
// 필요하므로, 아래 `계정 통합을 기다리고 있어요` 띠가 그때만 길을 연다. 바로가기로 되살리지 말 것.

/**
 * 주5일 한 줄에 적을 수강 방식. 두 줄을 한 줄로 합쳤으니 **두 트랙의 방식이 다르면 둘 다 적는다** —
 * 한쪽만 적으면 없는 말이 된다 (월수금 현장 + 화목금 불라방 같은 등록이 있을 수 있다).
 */
function modeLabelOf(
  enrollments: { mode: string; section: Week5Section | null }[],
  mode: string,
  section: Week5Section,
  week5: Set<number>,
) {
  if (!week5.has(section.id)) return MODE_LABEL[mode] ?? mode;
  const key = pairKey(section);
  const modes = new Set(
    enrollments.filter((x) => x.section && week5.has(x.section.id) && pairKey(x.section) === key).map((x) => x.mode),
  );
  return [...modes].map((m) => MODE_LABEL[m] ?? m).join(" · ");
}

/**
 * 인강인 트랙 (2026-09-17 Alan: 저녁반은 화목금이 인강).
 * 주5일은 두 줄이 한 줄로 합쳐지므로, **어느 트랙이 인강인지**를 함께 적어야 말이 된다.
 */
function recordedTracksOf(
  enrollments: { section: (Week5Section & { recorded?: boolean }) | null }[],
  section: Week5Section & { recorded?: boolean },
  week5: Set<number>,
) {
  const rows = week5.has(section.id)
    ? enrollments.filter((x) => x.section && week5.has(x.section.id) && pairKey(x.section) === pairKey(section))
    : [{ section }];
  return rows
    .filter((x) => x.section?.recorded)
    .map((x) => TRACK_LABEL[x.section!.track] ?? x.section!.track);
}

export default async function MyPage({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const [{ profile, user }, sp, verifications, week5, schedule, mergeRequests, unread, attendance] = await Promise.all([
    requireUser("/my"),
    searchParams,
    getMyVerifications(),
    getMyWeek5(),
    getMySchedule(),
    getMyMergeRequests(),
    getUnreadMessageCount(),
    // 이번 기수 내 출석률 (2026-09-22 Alan — "마이페이지에서 확인하면 동기부여"). 현장 반이 없으면 빈 배열
    createClient().then((s) => s.rpc("my_attendance_summary")).then((r) => r.data ?? []),
  ]);

  // 내가 신청하지 않은 통합 요청 = 이 계정에서 확인해야 합쳐진다 (2026-09-18 Alan)
  const mergeToConfirm = mergeRequests.filter((r) => r.requested_by !== user.id).length;

  const orders = schedule.orders;
  const name = profile?.name || user.email || "회원";
  // 카카오·구글로 들어온 계정은 그쪽 프로필 사진이 저절로 들어온다 (없으면 이름 첫 글자 동그라미)
  const photo = profilePhotoUrl(user.user_metadata);
  const latestVerification = verifications[0];
  const empty = orders.length === 0 && verifications.length === 0;

  /**
   * 등록 현황은 이름 옆(머리글)으로 올라갔다 (2026-09-17 Alan 요청). 자리가 좁으므로
   * **지금 유효한 등록만** 줄로 펴고, 끝난 등록은 달 이름만 한 줄로 접는다 —
   * 매달 등록이라(도메인 규칙 4) 다 펴면 해가 갈수록 머리글이 길어진다.
   */
  // 단계(개강 전 · 수강 중 · 끝남)는 **날짜로** 정한다 — 상태 열이 자정 배치 전이라도 종강 다음 날이면 끝난 등록이다
  const phaseOf = (o: (typeof orders)[number]) => orderPhase(o, schedule.today);
  const live = orders.filter((o) => phaseOf(o) !== "expired");
  /**
   * **종강일은 머리글(`내 등록 현황`) 오른쪽에 적는다** (2026-09-23 Alan — "'수강 중' 오른쪽에 종강날짜를
   * '내 등록 현황' 글자 오른쪽으로 옮겨줘. 왼쪽 프로필 사진과 높이가 안맞아서 균형이 안맞는것 같아").
   * 칩 줄 오른쪽 끝에 두면 사진 옆 **첫 줄이 제목 하나로 비어** 오른쪽에 빈자리가 남았다.
   *
   * **단 등록이 한 건일 때만이다** — 등록마다 종강일이 다르므로(이번 달 수강 중 + 다음 달 예비등록이
   * 함께 살아 있을 수 있다) 한 줄로는 못 적는다. 여러 건이면 예전처럼 등록 줄마다 적는다.
   */
  const soleLive = live.length === 1 ? live[0] : null;
  const phaseChip = (phase: ReturnType<typeof phaseOf>) => (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-black", phase === "active" ? "bg-brand-500 text-white" : "bg-ink text-white")}>
      {ORDER_STATUS_LABEL[phase] ?? phase}
    </span>
  );
  const expiredTerms = [
    ...new Set(
      orders
        .filter((o) => phaseOf(o) === "expired")
        .flatMap((o) => o.enrollments.map((e) => (e.section ? termLabel(e.section.term) : null)).filter(Boolean) as string[]),
    ),
  ];

  // 대시보드는 한 달만 보여 준다 — 이번 달(없으면 다음 달)이고, 전부 보는 길은 `/my/class`
  const monthIndex = initialMonth(schedule.months, schedule.today);
  const month = monthIndex >= 0 ? schedule.months[monthIndex] : null;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        {/* **인사는 맨 위 한 줄, 카드는 그 아래부터** (2026-09-22 Alan). 등급 칩은 없앴다 —
            학생에게 제 등급을 되풀이해 알려 줄 일이 없고, 한 줄이 두 줄로 늘어난다 */}
        <h1 className="text-xl font-black tracking-tight text-ink sm:text-2xl">
          <span className="font-semibold text-slate">반갑습니다 </span>
          {name}
          <span className="text-slate"> 님</span>
        </h1>

        {/* 내 등록 현황 — **왼쪽에 프로필 사진** (2026-09-22 Alan) · 종강일은 머리글 오른쪽 (2026-09-23 Alan) */}
        {orders.length > 0 && (
          <section aria-labelledby="orders-title" className="card flex gap-3 p-3.5 sm:gap-4 sm:p-4">
            <ProfilePhoto src={photo} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 id="orders-title" className="text-sm font-black text-ink">내 등록 현황</h2>
                {soleLive && phaseChip(phaseOf(soleLive))}
                {soleLive && (
                  <span className="ml-auto shrink-0 text-xs text-mist">
                    {formatDate(soleLive.access_until, { month: "numeric", day: "numeric" })} 종강까지 이용
                  </span>
                )}
              </div>

              {live.length === 0 ? (
                <p className="mt-2 text-sm text-slate">지금 유효한 등록이 없어요.</p>
              ) : (
                <ul className="mt-2 space-y-3">
                  {live.map((o) => {
                    const phase = phaseOf(o);
                    const preliminary = phase === "preliminary";
                    // "N월 예비등록생" 의 N 은 기수의 달 — 개강일의 달이 아니다 (10월 기수가 9/30 에 개강할 수 있다)
                    const termMonth = o.enrollments.find((e) => e.section?.term)?.section?.term?.month ?? monthOf(o.activates_on);
                    return (
                      <li key={o.id}>
                        {/* 등록이 여러 건일 때만 — 한 건이면 단계 배지·종강일이 머리글 줄에 이미 있다 */}
                        {!soleLive && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {phaseChip(phase)}
                            <span className="ml-auto text-xs text-mist">
                              {formatDate(o.access_until, { month: "numeric", day: "numeric" })} 종강까지 이용
                            </span>
                          </div>
                        )}

                        <ul className={cn("space-y-1", !soleLive && "mt-1.5")}>
                          {/* 주5일은 월수금·화목금 두 줄이 아니라 한 줄로 (2026-09-16 Alan) */}
                          {collapseWeek5(o.enrollments, (e) => e.section, week5).map((e) =>
                            e.section ? (
                              <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                                <span className="font-black text-ink">{termLabel(e.section.term)}</span>
                                <span className="font-semibold text-ink">{e.section.course?.name ?? "강좌"}</span>
                                <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-bold text-white">
                                  {studentTrackLabel(e.section, week5, TRACK_LABEL)}
                                </span>
                                {e.section.start_time && e.section.end_time ? (
                                  <span className="tabular-nums text-slate">{formatTimeRange(e.section.start_time, e.section.end_time)}</span>
                                ) : (
                                  e.section.time_block && <span className="tabular-nums text-slate">{e.section.time_block}</span>
                                )}
                                <span className={cn("text-xs font-bold", e.mode === "live" ? "text-brand-600" : "text-slate")}>
                                  {modeLabelOf(o.enrollments, e.mode, e.section, week5)}
                                </span>
                                {/* 저녁반 화목금은 인강 — 주5일이라 한 줄로 합쳐졌어도 그 트랙만 인강이다 */}
                                {recordedTracksOf(o.enrollments, e.section, week5).map((t) => (
                                  <span key={t} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-black text-violet-800">
                                    {t} {RECORDED_LABEL}
                                  </span>
                                ))}
                              </li>
                            ) : null,
                          )}
                        </ul>

                        {preliminary && (
                          <p className="mt-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-700">
                            <span className="font-black">{termMonth}월 예비등록생</span> · 개강일{" "}
                            {formatDate(o.activates_on, { month: "numeric", day: "numeric" })}부터 불라방·다시보기가 열려요.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* 끝난 등록은 접어 둔다 — 기록이 사라지지는 않게 달 이름만 남긴다 */}
              {expiredTerms.length > 0 && (
                <p className="mt-3 border-t border-line pt-2 text-xs text-mist">지난 등록 · {expiredTerms.join(" · ")}</p>
              )}
            </div>
          </section>
        )}
      </header>

      {sp.welcome === "1" && (
        <Alert kind="success" title="가입이 완료됐어요">
          수강증을 올리면 수강생으로 자동 등업되고, 불라방과 다시보기가 열립니다.
        </Alert>
      )}
      {sp.denied === "admin" && (
        <Alert kind="warning" title="관리자 페이지에 접근할 수 없어요">
          강사 또는 관리자 계정으로만 이용할 수 있습니다.
        </Alert>
      )}
      {unread > 0 && (
        <Alert kind="info" title={`새 알림 ${unread}개가 왔어요`}>
          <Link href="/my/notifications" className="font-bold underline">알림 보기</Link> — 선생님 안내나 불라방 수업 시작 알림이 들어 있어요.
        </Alert>
      )}
      {mergeToConfirm > 0 && (
        <Alert kind="warning" title="계정 통합을 기다리고 있어요">
          다른 계정에서 이 계정과 합치자고 신청했어요.{" "}
          <Link href="/my/account" className="font-bold underline">내 계정</Link>에서 확인하면 숙제·수강 기록이 한곳으로 모입니다.
        </Alert>
      )}

      {/* 휴대폰에서 아직 홈 화면 앱으로 설치하지 않았을 때만 보인다 */}
      <InstallApp variant="card" />

      {empty ? (
        <EmptyState
          icon="verify"
          title="아직 등록 내역이 없어요"
          description="YBM 공식 사이트에서 수강 신청 후 받은 수강증을 올리면 수강생으로 자동 등업됩니다."
          action={{ href: "/my/verify", label: "수강증 올리고 등업하기" }}
        />
      ) : (
        <>
          {/* 내 시간표 — 등록 현황이 있던 자리 (2026-09-17 Alan 요청 "내 시간표가 바로 나오면 좋겠어") */}
          <Reveal>
            <section aria-labelledby="schedule-title">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 id="schedule-title" className="text-lg font-black text-ink">
                  내 시간표
                  {month && <span className="ml-2 text-sm font-bold text-slate">{month.year}년 {month.month}월</span>}
                </h2>
                <Link href="/my/class" className="shrink-0 text-sm font-bold text-brand-600 hover:underline">
                  전체 보기 →
                </Link>
              </div>
              {month ? (
                <MonthSchedule
                  year={month.year}
                  month={month.month}
                  today={schedule.today}
                  marks={month.marks}
                  days={month.days}
                  lectures={month.lectures}
                  initial={month.initial}
                />
              ) : (
                <p className="card p-5 text-sm text-slate">
                  아직 볼 수 있는 수업일이 없어요. 등업신청이 승인되고 반이 배정되면 여기에 바로 표시됩니다.
                </p>
              )}
            </section>
          </Reveal>

          {/* 이번 기수 내 출석률 — 현장 수업이 있는 학생만 (불라방·인강만이면 그리지 않는다) */}
          {attendance.length > 0 && (
            <Reveal delay={60}>
              <AttendanceRate rows={attendance} />
            </Reveal>
          )}

          {/* 등업신청 현황 */}
          <Reveal delay={90}>
            <section aria-labelledby="verify-title" className="card p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 id="verify-title" className="text-lg font-black text-ink">등업신청 현황</h2>
                <Link href="/my/verify" className="text-sm font-bold text-brand-600 hover:underline">
                  신청하기 →
                </Link>
              </div>
              {!latestVerification ? (
                <p className="mt-4 text-sm text-slate">아직 올린 수강증이 없어요.</p>
              ) : (
                <div className="mt-4 flex items-start gap-3">
                  <Icon name={latestVerification.result === "rejected" ? "warning" : latestVerification.result === "approved" ? "success" : "upload"} size={32} />
                  <div className="text-sm">
                    <p className="font-black text-ink">{VERIFICATION_STATUS_LABEL(latestVerification.result)}</p>
                    <p className="text-slate">{formatDate(latestVerification.created_at, { year: "numeric", month: "long", day: "numeric" })} 접수</p>
                    {latestVerification.result === null && (
                      <p className="mt-1 text-slate">
                        {heldMonth(latestVerification.hold) != null
                          ? `${heldMonth(latestVerification.hold)}월 수강증으로 받아 뒀어요. ${heldMonth(latestVerification.hold)}월 반이 열리면 배정되고, 개강일에 수강생으로 자동 전환돼요.`
                          : "확인 후 자동으로 등업됩니다. 보통 1일 이내 처리돼요."}
                      </p>
                    )}
                    {latestVerification.result === "rejected" && latestVerification.reject_reason && (
                      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-800">사유: {latestVerification.reject_reason}</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        </>
      )}

      {/* 바로가기 */}
      <Reveal delay={140}>
        <section aria-labelledby="quick-title">
          <h2 id="quick-title" className="mb-3 text-lg font-black text-ink">바로가기</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {QUICK.map((q) => (
              <li key={q.href}>
                <Link href={q.href} className="card flex h-full flex-col items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-pink">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
                    <Icon name={q.icon} size={28} />
                  </span>
                  <span>
                    <span className="block font-black text-ink">{q.label}</span>
                    <span className="block text-xs text-slate">{q.desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>
    </div>
  );
}
