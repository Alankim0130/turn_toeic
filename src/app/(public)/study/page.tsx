import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { InstructorCameo } from "@/components/ui/InstructorCameo";
import { Alert } from "@/components/ui/Alert";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST } from "@/lib/utils";
import { termWindow } from "@/lib/term-window";
import {
  isSlotFull,
  isSlotKind,
  slotTime,
  sortSlots,
  STUDY_KIND_DESC,
  STUDY_KIND_ICON,
  STUDY_KIND_LABEL,
  STUDY_KINDS,
  termIndex,
} from "@/lib/study";
import { onlineSignupPhase, onlineStudyWindow, shortDay } from "@/lib/study-rounds";
import { getMyOrders, getMyStudyEligibility, getMyStudySignups } from "@/app/my/_lib/queries";
import { StudyCancelButton, StudySignupButton } from "./StudySignupButton";

export const metadata: Metadata = {
  title: "스터디 신청하기",
  description: "역전토익 수강생 스터디. 대면스터디·비대면스터디·단어스터디 중 원하는 스터디를 매달 강사가 정한 시간대에 신청하세요.",
  alternates: { canonical: "/study" },
  openGraph: {
    title: "스터디 신청하기 | 역전토익",
    description: "대면스터디·비대면스터디·단어스터디. 매달 열리는 역전토익 스터디에 신청하세요.",
    url: "/study",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "역전토익" }],
  },
};

const STEPS = [
  { icon: "offline", title: "대면스터디", desc: STUDY_KIND_DESC.offline },
  { icon: "online", title: "비대면스터디", desc: STUDY_KIND_DESC.online },
  { icon: "vocab", title: "단어스터디", desc: STUDY_KIND_DESC.vocab },
] as const;

export default async function StudyPage() {
  const { user } = await getSessionProfile();
  const supabase = await createClient();
  const today = todayKST();

  const [{ data: studyRows }, orders, signups] = await Promise.all([
    supabase
      .from("studies")
      .select("id, kind, status, notice, term:terms(id, year, month, enrollment_opens_at, closes_at), study_slots!study_slots_study_id_fkey(id, start_time, end_time, capacity, applied_count)")
      .neq("status", "draft"),
    user ? getMyOrders() : Promise.resolve([]),
    user ? getMyStudySignups() : Promise.resolve([]),
  ]);

  const { signupTerms, opensOn } = await getMyStudyEligibility(orders);
  const mySignup = new Map(signups.map((s) => [s.study_id, s]));
  // 개강 전 배정이 있으면 "N월 수강생만" 대신 개강일을 적어 준다 (2026-10-02 Alan — 신청은 개강일부터)
  const openDay = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

  // 아직 끝나지 않은 기수부터 가까운 두 달 — **종강일로** 가른다 (2026-09-22). 달력의 월로 가르면 9월 기수가 10/3 까지
  // 이어지는데 10/1 부터 사라졌다 (그 사이에도 9월 수강생은 신청·변경·취소를 할 수 있다). 날짜가 없는 기수는 그 달 말일까지
  const groups = new Map<number, { term: { id: number; year: number; month: number }; studies: NonNullable<typeof studyRows> }>();
  for (const s of studyRows ?? []) {
    if (!s.term || termWindow(s.term).closes < today) continue;
    const g = groups.get(s.term.id) ?? { term: s.term, studies: [] };
    g.studies.push(s);
    groups.set(s.term.id, g);
  }
  const nearbyGroups = [...groups.values()].sort((a, b) => termIndex(a.term) - termIndex(b.term)).slice(0, 2);
  /**
   * 로그인한 수강생에게는 **내 기수**를 보여 준다 (2026-10-02 Alan — 10월 예비등록생이 "이번 달 스터디 일정 보기" 를 누르니 9월이 나왔다).
   * 수강 중인 달 + 개강 전 배정 달. 그 달 스터디가 아직 없으면 빈 그룹으로 두어 "강사님이 설정 중" 카드가 선다.
   * 배정이 없는 방문자·회원은 예전처럼 끝나지 않은 가까운 두 달이다.
   */
  const myTermIds = new Set([...signupTerms, ...opensOn.keys()]);
  const myTerms = new Map<number, { id: number; year: number; month: number }>();
  for (const o of orders) {
    for (const e of o.enrollments) {
      if (e.section?.term && myTermIds.has(e.section.term_id)) myTerms.set(e.section.term_id, { id: e.section.term_id, ...e.section.term });
    }
  }
  const termGroups = myTerms.size
    ? [...myTerms.values()].sort((a, b) => termIndex(a) - termIndex(b)).map((term) => groups.get(term.id) ?? { term, studies: [] as NonNullable<typeof studyRows> })
    : nearbyGroups;
  const eligibleSomewhere = termGroups.some((g) => signupTerms.has(g.term.id));
  // 예비등록생의 가장 이른 개강일 — 신청은 그날부터다 (2026-10-02). 기수마다의 날짜는 아래 칩에도 적힌다
  const firstOpen = [...opensOn.values()].sort()[0];

  return (
    <section className="container-x py-10 sm:py-14">
      {/* 제목 오른쪽에 노트를 든 강사 캐리커처. PC 는 아래쪽이 소개 카드 뒤로 들어간다 */}
      <div className="flex items-end justify-between gap-3">
        <PageHeader icon="study" title="스터디 신청하기" description="혼자보다 함께. 매달 열리는 역전토익 스터디 중 나에게 맞는 스터디를 골라 신청하세요." />
        <InstructorCameo
          name="이혜영"
          pose="notebook"
          sizes="(min-width: 1024px) 180px, 90px"
          className="mb-2 h-36 shrink-0 sm:h-44 lg:-mb-28 lg:mr-8 lg:h-60"
        />
      </div>

      {/* 스터디 소개 */}
      <ul className="relative z-10 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 90} as="li">
            <article className="card flex h-full gap-4 p-5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50">
                <Icon name={s.icon} size={32} />
              </span>
              <div>
                <h2 className="text-lg font-black text-ink">{s.title}</h2>
                <p className="mt-1 text-sm text-slate">{s.desc}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </ul>

      {/* 신청 안내 */}
      <div className="mt-8">
        {!user ? (
          <Alert kind="info" title="스터디는 역전토익 수강생만 신청할 수 있어요">
            로그인하면 이 화면에서 바로 신청할 수 있어요.{" "}
            <Link href="/login?next=/study" className="font-bold text-brand-600 hover:underline">로그인하기 →</Link>
          </Alert>
        ) : termGroups.length > 0 && !eligibleSomewhere ? (
          firstOpen ? (
            <Alert kind="info" title={`${openDay(firstOpen)} 개강일부터 신청할 수 있어요`}>
              예비등록생은 개강일이 되면 이 화면에서 바로 신청할 수 있어요.
            </Alert>
          ) : (
            <Alert kind="warning" title="그 달 수강생으로 등록된 뒤에 신청할 수 있어요">
              수강증을 올려 등업하면 개강일부터 신청할 수 있어요.{" "}
              <Link href="/my/verify" className="font-bold text-brand-600 hover:underline">등업신청 하러 가기 →</Link>
            </Alert>
          )
        ) : signups.length > 0 ? (
          <Alert kind="success" title="신청한 스터디는 내 스터디에서 확인할 수 있어요">
            비대면스터디 자료 받기와 풀이 인증도 그곳에서 해요.{" "}
            <Link href="/my/study" className="font-bold text-brand-600 hover:underline">내 스터디 →</Link>
          </Alert>
        ) : null}
      </div>

      {/* 월별 일정 */}
      {termGroups.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center px-6 py-12 text-center">
          <Icon name="calendar" size={56} />
          <p className="mt-4 text-lg font-bold text-ink">이번 달 스터디 일정을 준비하고 있어요</p>
          <p className="mt-1 max-w-md text-sm text-slate">강사가 그 달 시간표를 정하면 여기에서 시간대를 보고 신청할 수 있어요.</p>
        </div>
      ) : (
        termGroups.map((g) => {
          const eligible = signupTerms.has(g.term.id);
          const ordered = STUDY_KINDS.map((k) => g.studies.find((s) => s.kind === k)).filter((s): s is NonNullable<typeof s> => !!s);
          return (
            <section key={g.term.id} aria-labelledby={`term-${g.term.id}`} className="mt-10">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 id={`term-${g.term.id}`} className="text-2xl font-black tracking-tight text-ink">
                  {g.term.year !== Number(today.slice(0, 4)) && `${g.term.year}년 `}
                  {g.term.month}월 스터디
                </h2>
                {user && (
                  <span className={cn("chip", !eligible && "!border-line !bg-surface !text-slate")}>
                    {eligible
                      ? "신청할 수 있어요"
                      : opensOn.has(g.term.id)
                        ? `${openDay(opensOn.get(g.term.id)!)} 개강부터 신청`
                        : `${g.term.month}월 수강생만 신청 가능`}
                  </span>
                )}
              </div>

              {/* 내 기수인데 스터디가 아직 없다 — 강사가 시간대를 정하는 중 (2026-10-02 Alan "강사님이 설정 중입니다") */}
              {ordered.length === 0 && (
                <div className="card flex flex-col items-center px-6 py-10 text-center">
                  <Icon name="calendar" size={48} />
                  <p className="mt-3 text-base font-bold text-ink">강사님이 {g.term.month}월 스터디를 설정 중이에요</p>
                  <p className="mt-1 max-w-md text-sm text-slate">
                    시간대가 정해지면 여기에서 바로 신청할 수 있어요{opensOn.has(g.term.id) ? ` — 신청은 ${openDay(opensOn.get(g.term.id)!)} 개강부터예요.` : "."}
                  </p>
                </div>
              )}
              <div className="grid gap-4 lg:grid-cols-3">
                {ordered.map((study, i) => {
                  const mine = mySignup.get(study.id);
                  // 비대면은 개강일부터 달력 3일만 신청 · 취소한다 (2026-10-05 Alan "개강후 3일동안만 신청받고 4일째부터 시작").
                  // 대면 · 단어는 그대로 신청 받는 중(open)이면 언제나. 실제로 막는 것은 DB 정책(private.study_signup_open)이다
                  const online = study.kind === "online";
                  const opens = study.term?.enrollment_opens_at ?? null;
                  const studyWindow = online && opens ? onlineStudyWindow(opens) : null;
                  const phase = online ? onlineSignupPhase(opens, today) : null;
                  const open = study.status === "open" && (!online || phase === "open");
                  const canAct = !!user && eligible && open;
                  const slots = sortSlots(study.study_slots ?? []);
                  return (
                    <Reveal key={study.id} delay={i * 80} className="card flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50">
                            <Icon name={STUDY_KIND_ICON[study.kind]} size={28} />
                          </span>
                          <h3 className="text-lg font-black text-ink">{STUDY_KIND_LABEL[study.kind]}</h3>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
                            open ? "bg-brand-500 text-white" : study.status === "open" && phase === "before" ? "bg-brand-50 text-brand-700" : "bg-ink text-white",
                          )}
                        >
                          {open ? "신청 받는 중" : study.status === "open" && phase === "before" && studyWindow ? `${shortDay(studyWindow.signupFrom)}부터 신청` : "신청 마감"}
                        </span>
                      </div>
                      {/* 비대면: 신청 기간 · 시작일 — 개강일(강사가 정한 날)부터 3일 신청, 4일째 시작 */}
                      {studyWindow && (
                        <p className="mt-3 rounded-xl bg-brand-50 px-3 py-2 text-sm text-ink-soft">
                          신청{" "}
                          <strong className="text-ink">
                            {shortDay(studyWindow.signupFrom)} ~ {shortDay(studyWindow.signupUntil)}
                          </strong>{" "}
                          · <strong className="text-brand-700">{shortDay(studyWindow.startsOn)}부터 시작</strong>
                          <span className="mt-0.5 block text-xs text-slate">개강일부터 3일 동안만 신청할 수 있어요.</span>
                        </p>
                      )}
                      {study.notice && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface p-3 text-sm text-ink-soft">{study.notice}</p>}

                      {isSlotKind(study.kind) ? (
                        slots.length === 0 ? (
                          <p className="mt-4 text-sm text-slate">시간대가 곧 열려요.</p>
                        ) : (
                          <ul className="mt-4 space-y-2">
                            {slots.map((slot, n) => {
                              const isMine = mine?.slot_id === slot.id;
                              const full = isSlotFull(slot);
                              return (
                                <li
                                  key={slot.id}
                                  className={cn(
                                    "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
                                    isMine ? "border-brand-400 bg-brand-50" : "border-line bg-paper",
                                  )}
                                >
                                  <div>
                                    <p className="font-bold text-ink">
                                      <span className="mr-1.5 text-sm font-black text-brand-600">{n + 1}타임</span>
                                      <span className="tabular-nums">{slotTime(slot)}</span>
                                    </p>
                                    <p className={cn("text-xs", full && !isMine ? "font-semibold text-red-600" : "text-slate")}>
                                      {slot.capacity !== null ? `정원 ${slot.capacity}명 · ${slot.applied_count}명 신청` : `${slot.applied_count}명 신청`}
                                      {full && !isMine && " · 마감"}
                                    </p>
                                  </div>
                                  {isMine ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-black text-white">내 시간대</span>
                                      {canAct && <StudyCancelButton studyId={study.id} />}
                                    </div>
                                  ) : (
                                    canAct &&
                                    !full && <StudySignupButton studyId={study.id} slotId={slot.id} label={mine ? "이 시간으로 변경" : "신청"} variant={mine ? "secondary" : "primary"} />
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )
                      ) : (
                        <div className="mt-4 rounded-xl border border-line bg-paper p-3 text-sm">
                          {mine ? (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="rounded-full bg-brand-500 px-2.5 py-0.5 text-xs font-black text-white">신청 완료</span>
                              <span className="flex flex-wrap gap-1">
                                {/* 비대면 풀이는 내 스터디에서 인증한다 — 숙제업로드(정규 수업 숙제)로 보내지 않는다 (2026-09-23 Alan) */}
                                <Link href="/my/study" className="btn-secondary !px-3 !py-1.5 text-xs">
                                  <Icon name="download" size={14} />
                                  자료 받기 · 인증
                                </Link>
                              </span>
                              {canAct && (
                                <div className="w-full">
                                  <StudyCancelButton studyId={study.id} warning="취소하면 자료를 더 받을 수 없어요." />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-slate">
                                {studyWindow && phase === "after"
                                  ? "신청 기간이 끝났어요. 다음 달 개강일부터 3일 동안 다시 신청할 수 있어요."
                                  : studyWindow
                                    ? `${shortDay(studyWindow.startsOn)}부터 수업일마다 그날 자료가 열려요.`
                                    : "수업일마다 그날 자료가 열려요."}
                              </p>
                              {canAct && <StudySignupButton studyId={study.id} slotId={null} label="신청하기" />}
                            </div>
                          )}
                        </div>
                      )}

                      {!user && open && (
                        <Link href="/login?next=/study" className="btn-dark mt-4 !py-2.5 text-sm">
                          로그인하고 신청하기
                        </Link>
                      )}
                    </Reveal>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </section>
  );
}
