import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayKST, formatDate, MODE_LABEL } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { loginLabel, lastSeenLabel, kstDay, shortDay } from "@/lib/account";
import { STUDY_KIND_LABEL, STUDY_KINDS } from "@/lib/study";
import { week5SectionIds, collapseWeek5, pairKey } from "@/lib/week5";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StudentCard, type StudentCardMeta } from "@/components/admin/students/StudentCard";
import { getRosterSets, getCurrentOrUpcomingTerm, sectionChip } from "../_lib/queries";
import { ROLE_LABEL, requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "학생명단", robots: { index: false } };

const TABS = [
  { value: "active", label: "등록생" },
  { value: "preliminary", label: "예비등록생" },
  { value: "alumni", label: "졸업생" },
  // 강사·관리자 계정 — 테스트 등급을 켜서 학생 화면을 확인한다 (2026-09-16 Alan 요청)
  { value: "testers", label: "테스터" },
  // 등급을 바꾸려면 아직 등록이 없는 사람(가입만 한 회원·강사)도 찾을 수 있어야 한다
  { value: "all", label: "전체" },
];
const STAFF_ROLES = ["instructor", "admin"] as const;

/** "대면스터디" → "대면" (명단은 칸이 좁다). 신청 순서는 STUDY_KINDS 를 따른다 */
const studyShort = (kind: string) => (STUDY_KIND_LABEL[kind] ?? kind).replace("스터디", "");

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const { tab: tabParam, q: qParam } = await searchParams;
  const tab = TABS.some((t) => t.value === tabParam) ? (tabParam as string) : "active";
  const q = (qParam ?? "").trim();

  const supabase = await createClient();
  const today = todayKST();
  const [roster, term] = await Promise.all([getRosterSets(supabase, today), getCurrentOrUpcomingTerm(supabase, today)]);

  // 대상 프로필
  let profileQuery = supabase.from("profiles").select("id, name, phone, role, test_role, university, department, created_at").order("name").limit(300);
  if (tab === "alumni") profileQuery = profileQuery.eq("role", "alumni");
  else if (tab === "testers") profileQuery = profileQuery.in("role", [...STAFF_ROLES]);
  else if (tab === "all") {
    // 걸러내지 않는다 — 이름 검색으로 좁힌다
  } else {
    const ids = tab === "active" ? roster.activeIds : roster.preliminaryIds;
    if (ids.length === 0) profileQuery = profileQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
    else profileQuery = profileQuery.in("id", ids);
  }
  if (q) profileQuery = profileQuery.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
  const { data: profiles } = await profileQuery;
  const ids = (profiles ?? []).map((p) => p.id);

  const [{ data: enrollments }, { data: expiredOrders }, { count: testerCount }, { data: accounts }, { data: studySignups }] = await Promise.all([
    ids.length
      ? supabase
          .from("enrollments")
          .select("id, student_id, mode, status, section:class_sections!enrollments_section_id_fkey(id, term_id, course_id, track, start_time, time_block, closes_at, term:terms(year, month), course:courses(name, target_score, program))")
          .in("student_id", ids)
          .order("id")
      : Promise.resolve({ data: [] as never[] }),
    tab === "alumni" && ids.length
      ? supabase.from("enrollment_orders").select("user_id, access_until").in("user_id", ids).order("access_until", { ascending: false })
      : Promise.resolve({ data: [] as { user_id: string; access_until: string }[] }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", [...STAFF_ROLES]),
    // 이메일·로그인 방식·마지막 접속은 auth 스키마에 있어 스태프 전용 함수로 읽는다 (2026-09-18 Alan 요청).
    // 함수가 막히거나(테스트 등급을 켠 스태프) 실패해도 명단은 그대로 뜬다 — 계정 칸만 비워진다
    ids.length
      ? supabase.rpc("student_auth_info", { p_ids: ids })
      : Promise.resolve({ data: [] as { user_id: string; email: string | null; providers: string[]; last_sign_in_at: string | null }[] }),
    // 이번(또는 곧 올) 기수의 스터디 신청 — 대면 · 비대면 · 단어
    ids.length && term
      ? supabase.from("study_signups").select("user_id, study:studies!inner(kind, term_id)").in("user_id", ids).eq("study.term_id", term.id)
      : Promise.resolve({ data: [] as { user_id: string; study: { kind: string } | null }[] }),
  ]);

  const enrollByUser = new Map<string, NonNullable<typeof enrollments>>();
  for (const e of enrollments ?? []) enrollByUser.set(e.student_id, [...(enrollByUser.get(e.student_id) ?? []), e]);
  const lastAccess = new Map<string, string>();
  for (const o of expiredOrders ?? []) if (!lastAccess.has(o.user_id)) lastAccess.set(o.user_id, o.access_until);
  const accountById = new Map((accounts ?? []).map((a) => [a.user_id, a]));
  const studiesByUser = new Map<string, Set<string>>();
  for (const s of studySignups ?? []) {
    if (!s.study?.kind) continue;
    studiesByUser.set(s.user_id, (studiesByUser.get(s.user_id) ?? new Set()).add(s.study.kind));
  }

  const counts = { active: roster.activeIds.length, preliminary: roster.preliminaryIds.length };
  const rows = profiles ?? [];

  return (
    <>
      <PageHeader icon="students" title="학생명단" description="등록생은 개강일~종강일 사이, 예비등록생은 개강 전 등록 완료, 졸업생은 종강일 경과 기준입니다. 카드를 누르면 등급·반 배정을 바꿉니다.">
        <form method="get" className="flex gap-2">
          <input type="hidden" name="tab" value={tab} />
          <input name="q" defaultValue={q} placeholder="이름 검색" className="input !w-40 !py-2 sm:!w-52" aria-label="이름 검색" />
          <button type="submit" className="btn-secondary !py-2">검색</button>
        </form>
      </PageHeader>

      <FilterTabs
        basePath="/admin/students"
        paramKey="tab"
        current={tab}
        keep={{ q }}
        tabs={TABS.map((t) => ({
          ...t,
          count: t.value === "active" ? counts.active : t.value === "preliminary" ? counts.preliminary : t.value === "testers" ? (testerCount ?? undefined) : undefined,
        }))}
      />
      {tab === "testers" && (
        <p className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          강사·관리자 계정이에요. 이름을 눌러 <b>테스트 등급</b>(회원 · 수강생 · 졸업생)을 켜고 반을 배정하면, 진짜 등급은 그대로 둔 채 학생이 보는 화면을 확인할 수 있어요.
          테스터는 등록생 · 예비등록생 수에 세지 않습니다.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="students" title={q ? `“${q}” 검색 결과가 없습니다` : "해당하는 학생이 없습니다"} description={tab === "active" ? "수강증 승인 후 개강일이 지나면 등록생으로 표시됩니다." : undefined} />
      ) : (
        <>
          <p className="mb-3 text-sm font-black text-slate">
            {rows.length}명{rows.length === 300 && <span className="ml-1 font-semibold text-mist">(300명까지 보여요 — 이름으로 찾아보세요)</span>}
          </p>
          {/* 표가 아니라 카드다 — 휴대폰에서 옆으로 밀지 않고 한 화면에 다 보이게 (2026-09-18 Alan) */}
          <ul className="grid gap-3 lg:grid-cols-2">
            {rows.map((p) => {
              const orders = roster.ordersByUser.get(p.id) ?? [];
              const prelimOrder = orders.filter((o) => o.status === "preliminary").sort((a, b) => a.activates_on.localeCompare(b.activates_on))[0];
              const activeOrder = orders.filter((o) => o.status === "active").sort((a, b) => b.access_until.localeCompare(a.access_until))[0];
              const myEnroll = enrollByUser.get(p.id) ?? [];
              // 주5일이면 월수금·화목금 두 줄을 한 줄 `주5일` 로 합친다 (2026-09-19 Alan).
              // 짝은 **그 학생이 듣는 반 안에서만** 찾는다 — 전체 명단으로 찾으면 다른 학생의 반과 짝이 된다
              const mySections = myEnroll.map((e) => e.section).filter((x) => !!x);
              const week5 = week5SectionIds(mySections);
              // 합친 줄의 수강 방식은 두 트랙이 다르면 둘 다 적는다 — 한쪽만 적으면 없는 말이 된다
              const pairModes = new Map<string, Set<string>>();
              for (const e of myEnroll) {
                if (!e.section || !week5.has(e.section.id)) continue;
                const k = pairKey(e.section);
                if (k) pairModes.set(k, (pairModes.get(k) ?? new Set<string>()).add(e.mode));
              }
              const myClasses = collapseWeek5(myEnroll, (e) => e.section, week5);
              const account = accountById.get(p.id);
              const kinds = studiesByUser.get(p.id);
              const studyValue = kinds ? STUDY_KINDS.filter((k) => kinds.has(k)).map(studyShort).join(" · ") : "";

              const foot =
                tab === "preliminary" && prelimOrder
                  ? { label: "개강", value: formatDate(prelimOrder.activates_on, { month: "long", day: "numeric" }) }
                  : tab === "active" && activeOrder
                    ? { label: "만료", value: formatDate(activeOrder.access_until, { month: "long", day: "numeric" }) }
                    : tab === "alumni" && lastAccess.get(p.id)
                      ? { label: "만료", value: formatDate(lastAccess.get(p.id)!, { year: "numeric", month: "long", day: "numeric" }) }
                      : null;

              // 아이콘 한 줄씩 흘려 놓는다 (첫토익 학생 리스트와 같은 배치) — 상자에 담지 않는다
              const metas: StudentCardMeta[] = [];
              if (p.phone) metas.push({ icon: "phone", value: formatPhone(p.phone), href: `tel:${p.phone}` });
              if (account?.email) metas.push({ icon: "mail", value: account.email, href: `mailto:${account.email}` });
              const login = loginLabel(account?.providers);
              if (login) metas.push({ icon: "key", value: `${login} 로그인` });
              if (p.created_at) metas.push({ icon: "calendar", label: "가입", value: shortDay(kstDay(p.created_at)) });
              const seen = lastSeenLabel(account?.last_sign_in_at, today);
              if (seen) metas.push({ icon: "clock", label: "접속", value: seen });
              if (foot) metas.push({ icon: "calendar", label: foot.label, value: foot.value });
              if (studyValue) metas.push({ icon: "check", label: "스터디", value: studyValue });

              return (
                <StudentCard
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  role={p.role}
                  tester={p.role === "instructor" || p.role === "admin"}
                  testRoleLabel={p.test_role ? ROLE_LABEL[p.test_role] : null}
                  affiliation={[p.university, p.department].filter(Boolean).join(" · ")}
                  chip={tab === "preliminary" && prelimOrder ? `${Number(prelimOrder.activates_on.slice(5, 7))}월 예비등록생` : undefined}
                  classes={myClasses.map((e) => {
                    const k = e.section && week5.has(e.section.id) ? pairKey(e.section) : null;
                    const modes = [...(k ? (pairModes.get(k) ?? new Set([e.mode])) : new Set([e.mode]))];
                    return {
                      id: e.id,
                      label: sectionChip(e.section, week5),
                      // 둘이 섞이면 색을 한쪽으로 칠할 수 없다 (null = 잉크)
                      mode: modes.length === 1 ? modes[0] : null,
                      modeLabel: modes.map((m) => MODE_LABEL[m] ?? m).join(" · "),
                    };
                  })}
                  metas={metas}
                />
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
