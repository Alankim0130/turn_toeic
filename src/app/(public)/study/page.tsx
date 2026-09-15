import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/ui/Reveal";
import { Alert } from "@/components/ui/Alert";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, todayKST } from "@/lib/utils";
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
  const [ty, tm] = today.split("-").map(Number);
  const nowIndex = ty * 12 + tm;

  const [{ data: studyRows }, orders, signups] = await Promise.all([
    supabase
      .from("studies")
      .select("id, kind, status, notice, term:terms(id, year, month), study_slots!study_slots_study_id_fkey(id, start_time, end_time, capacity, applied_count)")
      .neq("status", "draft"),
    user ? getMyOrders() : Promise.resolve([]),
    user ? getMyStudySignups() : Promise.resolve([]),
  ]);

  const { signupTerms } = await getMyStudyEligibility(orders);
  const mySignup = new Map(signups.map((s) => [s.study_id, s]));

  // 이번 달부터 가까운 두 달
  const groups = new Map<number, { term: { id: number; year: number; month: number }; studies: NonNullable<typeof studyRows> }>();
  for (const s of studyRows ?? []) {
    if (!s.term || termIndex(s.term) < nowIndex) continue;
    const g = groups.get(s.term.id) ?? { term: s.term, studies: [] };
    g.studies.push(s);
    groups.set(s.term.id, g);
  }
  const termGroups = [...groups.values()].sort((a, b) => termIndex(a.term) - termIndex(b.term)).slice(0, 2);
  const eligibleSomewhere = termGroups.some((g) => signupTerms.has(g.term.id));

  return (
    <section className="container-x py-10 sm:py-14">
      <PageHeader icon="study" title="스터디 신청하기" description="혼자보다 함께. 매달 열리는 역전토익 스터디 중 나에게 맞는 스터디를 골라 신청하세요." />

      {/* 스터디 소개 */}
      <ul className="grid gap-4 md:grid-cols-3">
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
          <Alert kind="warning" title="그 달 수강생으로 등록된 뒤에 신청할 수 있어요">
            수강증을 올려 등업하면 개강 전(예비등록생)에도 신청할 수 있어요.{" "}
            <Link href="/my/verify" className="font-bold text-brand-600 hover:underline">등업신청 하러 가기 →</Link>
          </Alert>
        ) : signups.length > 0 ? (
          <Alert kind="success" title="신청한 스터디는 내 스터디에서 확인할 수 있어요">
            비대면스터디 자료 받기와 숙제제출도 그곳에서 이어집니다.{" "}
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
                  {g.term.year !== ty && `${g.term.year}년 `}
                  {g.term.month}월 스터디
                </h2>
                {user && (
                  <span className={cn("chip", !eligible && "!border-line !bg-surface !text-slate")}>
                    {eligible ? "신청할 수 있어요" : `${g.term.month}월 수강생만 신청 가능`}
                  </span>
                )}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {ordered.map((study, i) => {
                  const mine = mySignup.get(study.id);
                  const open = study.status === "open";
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
                        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", open ? "bg-brand-500 text-white" : "bg-ink text-white")}>
                          {open ? "신청 받는 중" : "신청 마감"}
                        </span>
                      </div>
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
                                <Link href="/my/study" className="btn-secondary !px-3 !py-1.5 text-xs">
                                  <Icon name="download" size={14} />
                                  자료 받기
                                </Link>
                                <Link href="/my/homework" className="btn-secondary !px-3 !py-1.5 text-xs">
                                  <Icon name="homework" size={14} />
                                  숙제제출
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
                              <p className="text-slate">수업일마다 그날 자료가 열려요.</p>
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
