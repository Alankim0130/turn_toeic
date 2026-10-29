import type { Metadata } from "next";
import { readAllIn } from "@/lib/read-all";
import { createClient } from "@/lib/supabase/server";
import { todayKST, formatDate, MODE_LABEL, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { loginLabel, lastSeenLabel, kstDay, shortDay } from "@/lib/account";
import { pickPhoto, safePhotoUrl } from "@/lib/avatar";
import { signedAvatarUrls } from "@/lib/avatar-url";
import { STUDY_KIND_LABEL, STUDY_KINDS, termParam } from "@/lib/study";
import { week5SectionIds, groupWeek5 } from "@/lib/week5";
import { SINGLE_SUBJECT_LABEL, singleSubjectOf } from "@/lib/section-type";
import { groupByLevel, ROSTER_NAME, rosterFileName, rosterPeriod, rosterTerms, type RosterBy } from "@/lib/class-roster";
import { pickCurrentTerm } from "@/lib/term-window";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { StudentCard, type StudentCardMeta } from "@/components/admin/students/StudentCard";
import { ClassRosterView, RosterViewSwitch, type RosterView } from "@/components/admin/students/ClassRosterView";
import { getRosterSets, sectionChip, TERM_COLUMNS } from "../_lib/queries";
import { loadClassRoster } from "./_lib/class-roster";
import { ROLE_LABEL, requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "학생명단", robots: { index: false } };

const TABS = [
  { value: "active", label: "등록생" },
  { value: "preliminary", label: "예비등록생" },
  { value: "alumni", label: "졸업생" },
  // 강사(이혜영·이영수)·관리자·조교 계정 (2026-10-02 Alan — "'테스터' 를 강사, 조교로 변경"). 강사·관리자는 여기서 테스트 등급을 켠다
  { value: "staff", label: "강사·조교" },
  // 등급을 바꾸려면 아직 등록이 없는 사람(가입만 한 회원·강사)도 찾을 수 있어야 한다
  { value: "all", label: "전체" },
];
const CREW_ROLES = ["instructor", "admin", "assistant"] as const;

/** "단어 스터디" → "단어" · "비대면스터디" → "비대면" (명단은 칸이 좁다). 신청 순서는 STUDY_KINDS 를 따른다 */
const studyShort = (kind: string) => (STUDY_KIND_LABEL[kind] ?? kind).replace(/\s*스터디$/, "");

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; view?: string; term?: string }>;
}) {
  // 조교는 이 화면을 쓸 수 없다 — 학생명단은 개인정보가 있어 강사 · 관리자만 (2026-10-03 Alan. 그전에는 조교도 봤다).
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const { profile: me } = await requireStaff();
  const { tab: tabParam, q: qParam, view: viewParam, term: termQuery } = await searchParams;
  // 예전 주소(tab=testers)도 받는다 — 2026-10-02 에 탭 이름이 강사·조교로 바뀌었다
  const tab = tabParam === "testers" ? "staff" : TABS.some((t) => t.value === tabParam) ? (tabParam as string) : "active";
  const q = (qParam ?? "").trim();
  // 반별 명단 (2026-10-14 Alan — 종이 명단처럼 "레벨별로 가나다순 … Pc모드에서는 지금 올린 이미지처럼 한페이지에서"):
  // 등록생 · 예비등록생 탭에서, 이름을 찾는 중이 아닐 때. 보기를 고르지 않으면 PC 는 반별 명단 · 휴대폰은 카드 (둘 다 그리고 화면 폭으로 숨긴다).
  // 레벨별 명단(같은 날 밤 Alan "시간대는 없애고 같은 레벨별로 … 월수금/ 화목금만 분리")은 골랐을 때만 — 반별 명단 자리에 대신 선다
  const view: RosterView | null = viewParam === "classes" || viewParam === "levels" || viewParam === "cards" ? viewParam : null;
  const rosterBy: RosterBy = view === "levels" ? "track" : "time";
  const classTab = (tab === "active" || tab === "preliminary") && !q;

  const supabase = await createClient();
  const today = todayKST();
  const [roster, { data: allTerms }] = await Promise.all([getRosterSets(supabase, today), supabase.from("terms").select(TERM_COLUMNS)]);
  // 이번(또는 곧 올) 기수 — 스터디 신청 줄
  const term = pickCurrentTerm(allTerms ?? [], today);
  // 반별 명단의 달 — 아직 종강하지 않은 달. 등록생 탭은 지금 수업 중인 달, 예비등록생 탭은 개강 전 달이 먼저
  const rosterOptions = classTab ? rosterTerms(allTerms ?? [], today) : [];
  const termMatch = termQuery?.match(/^(\d{4})-(\d{2})$/);
  const rosterTerm =
    (termMatch ? rosterOptions.find((t) => t.year === Number(termMatch[1]) && t.month === Number(termMatch[2])) : undefined) ??
    (tab === "preliminary" ? rosterOptions.find((t) => today < (t.enrollment_opens_at ?? "")) : undefined) ??
    pickCurrentTerm(rosterOptions, today);
  // 명단과 따로 도는 조회 — 카드 쪽 조회를 기다리지 않게 먼저 띄운다
  const classRosterP = classTab && rosterTerm ? loadClassRoster(supabase, rosterTerm, today, rosterBy) : Promise.resolve(null);

  // 대상 프로필
  // 합쳐진 옛 계정(merged_into)은 명단에서 뺀다 — 로그인도 못 하고 기록은 남은 계정에 있다 (2026-10-02)
  const profileQuery = () => {
    let pq = supabase
      .from("profiles")
      .select("id, name, phone, role, test_role, university, department, created_at, avatar_path")
      .is("merged_into", null);
    if (q) pq = pq.ilike("name", `%${q.replace(/[%_]/g, "")}%`);
    return pq;
  };
  const PROFILE_MAX = 300;
  let profiles: Awaited<ReturnType<typeof profileQuery>>["data"];
  if (tab === "active" || tab === "preliminary") {
    // 등록생 · 예비등록생 — id 를 100개씩 나눠 묻는다 (2026-10-29). 예전에는 id 를 전부 `.in()` 하나에 실어서, 방학에 600명이면
    // 요청 주소가 20KB 를 넘어 실패하고 탭이 "해당하는 학생이 없습니다" 로 비었다. 이름순 300명까지는 예전과 같다
    const want = tab === "active" ? roster.activeIds : roster.preliminaryIds;
    const { rows } = await readAllIn(want, (chunk, from, to) => profileQuery().in("id", chunk).order("id").range(from, to));
    profiles = rows.sort((a, b) => a.name.localeCompare(b.name, "ko")).slice(0, PROFILE_MAX);
  } else {
    let pq = profileQuery().order("name").limit(PROFILE_MAX);
    if (tab === "alumni") pq = pq.eq("role", "alumni");
    else if (tab === "staff") pq = pq.in("role", [...CREW_ROLES]);
    // 전체 탭은 걸러내지 않는다 — 이름 검색으로 좁힌다
    ({ data: profiles } = await pq);
  }
  const ids = (profiles ?? []).map((p) => p.id);

  const [{ data: enrollments }, { data: expiredOrders }, { count: testerCount }, { data: accounts }, { data: studySignups }] = await Promise.all([
    // 학생 300명 × 지난달들까지의 배정은 1,000줄을 넘는다 — id 를 100개씩 나눠 1,000줄씩 읽는다 (2026-10-29: 넘친 학생의 반 배지가 조용히 빠졌다)
    readAllIn(ids, (chunk, from, to, count) =>
      supabase
        .from("enrollments")
        .select(
          "id, student_id, mode, status, section:class_sections!enrollments_section_id_fkey(id, term_id, course_id, track, start_time, time_block, subject, enrollment_opens_at, closes_at, term:terms(year, month), course:courses(name, target_score, program, course_type))",
          count ? { count: "exact" } : undefined,
        )
        .in("student_id", chunk)
        .order("id")
        .range(from, to),
    ).then((r) => ({ data: r.rows })),
    tab === "alumni" && ids.length
      ? readAllIn(ids, (chunk, from, to, count) =>
          supabase
            .from("enrollment_orders")
            .select("id, user_id, access_until", count ? { count: "exact" } : undefined)
            .in("user_id", chunk)
            .order("access_until", { ascending: false })
            .order("id")
            .range(from, to),
        ).then((r) => ({ data: r.rows }))
      : Promise.resolve({ data: [] as { user_id: string; access_until: string }[] }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).in("role", [...CREW_ROLES]).is("merged_into", null),
    // 이메일·로그인 방식·마지막 접속은 auth 스키마에 있어 스태프 전용 함수로 읽는다 (2026-09-18 Alan 요청).
    // 함수가 막히거나(테스트 등급을 켠 스태프) 실패해도 명단은 그대로 뜬다 — 계정 칸만 비워진다
    ids.length
      ? supabase.rpc("student_auth_info", { p_ids: ids })
      : Promise.resolve({ data: [] as { user_id: string; email: string | null; providers: string[]; last_sign_in_at: string | null; avatar_url: string | null }[] }),
    // 이번(또는 곧 올) 기수의 스터디 신청 — 단어 · 비대면
    ids.length && term
      ? readAllIn(ids, (chunk, from, to, count) =>
          supabase
            .from("study_signups")
            .select("id, user_id, study:studies!inner(kind, term_id)", count ? { count: "exact" } : undefined)
            .in("user_id", chunk)
            .eq("study.term_id", term.id)
            .order("id")
            .range(from, to),
        ).then((r) => ({ data: r.rows }))
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
  const classRoster = await classRosterP;
  /** 지금 주소에서 몇 칸만 바꾼 주소 — 달 · 보기를 들고 다닌다 */
  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const now: Record<string, string | undefined> = {
      tab,
      q: q || undefined,
      view: view ?? undefined,
      term: termQuery,
      ...patch,
    };
    for (const [k, v] of Object.entries(now)) if (v) p.set(k, v);
    return `/admin/students?${p.toString()}`;
  };
  // 프로필 사진 — 올린 사진(서명 URL)이 있으면 그것, 없으면 카카오·구글 사진 (2026-10-02 Alan).
  // 강사·관리자만 눌러서 크게 본다
  const avatarUrls = await signedAvatarUrls(supabase, rows.map((p) => p.avatar_path));
  const photoOf = (p: { id: string; avatar_path: string | null }) =>
    pickPhoto(p.avatar_path ? avatarUrls.get(p.avatar_path) : null, safePhotoUrl(accountById.get(p.id)?.avatar_url));
  const canZoom = me.role === "instructor" || me.role === "admin";

  /** 학생 한 사람 = 카드 한 장 */
  const card = (p: (typeof rows)[number]) => {
    const orders = roster.ordersByUser.get(p.id) ?? [];
    // 등록생 · 예비등록생은 **날짜로** 가른다 (개강일 ≤ 오늘 ≤ 종강일 / 오늘 < 개강일) — getRosterSets 와 같다
    const prelimOrder = orders.filter((o) => today < o.activates_on).sort((a, b) => a.activates_on.localeCompare(b.activates_on))[0];
    const activeOrder = orders.filter((o) => o.activates_on <= today && today <= o.access_until).sort((a, b) => b.access_until.localeCompare(a.access_until))[0];
    // 등록생 · 예비등록생 탭에는 **아직 종강하지 않은 반**만 — 지난 달 반이 이번 달 반 옆에 쌓이지 않게 (2026-09-22)
    const myEnroll = (enrollByUser.get(p.id) ?? []).filter((e) => (tab === "active" || tab === "preliminary" ? !!e.section && e.section.closes_at >= today : true));
    // "N월 예비등록생" 의 N 은 **기수의 달** — 개강일의 달이 아니다 (10월 기수가 9/30 에 개강할 수 있다)
    const prelimTerm = myEnroll
      .map((e) => e.section)
      .filter((s): s is NonNullable<typeof s> => !!s && today < s.enrollment_opens_at)
      .sort((x, y) => x.enrollment_opens_at.localeCompare(y.enrollment_opens_at))[0]?.term;
    // 주5일이면 월수금·화목금 두 줄을 한 줄 `주5일` 로 합친다 (2026-09-19 Alan).
    // 짝은 **그 학생이 듣는 반 안에서만** 찾는다 — 전체 명단으로 찾으면 다른 학생의 반과 짝이 된다
    const mySections = myEnroll.map((e) => e.section).filter((x) => !!x);
    const week5 = week5SectionIds(mySections);
    // 한 줄 = 주5일이면 월수금 + 화목금 두 배정 (월수금이 앞)
    const myLines = groupWeek5(myEnroll, (e) => e.section, week5);
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
        testRoleLabel={p.test_role ? ROLE_LABEL[p.test_role] : null}
        photo={photoOf(p)}
        zoom={canZoom}
        affiliation={[p.university, p.department].filter(Boolean).join(" · ")}
        chip={tab === "preliminary" && prelimOrder ? `${prelimTerm?.month ?? Number(prelimOrder.activates_on.slice(5, 7))}월 예비등록생` : undefined}
        classes={myLines.map((line) => {
          const e = line[0];
          // 합친 줄의 수강 방식은 두 트랙이 다르면 둘 다 적는다 — 한쪽만 적으면 없는 말이 된다
          const modes = [...new Set(line.map((x) => x.mode))];
          // 단과(RC · LC)만 적고 종합은 적지 않는다 — 주5일 60분은 두 트랙의 과목이 달라 단과가 아니다 (2026-10-05 Alan)
          const single = singleSubjectOf(line.flatMap((x) => (x.section ? [x.section] : [])));
          return {
            id: e.id,
            label: sectionChip(e.section, week5),
            // 둘이 섞이면 색을 한쪽으로 칠할 수 없다 (null = 잉크)
            mode: modes.length === 1 ? modes[0] : null,
            modeLabel: modes.map((m) => MODE_LABEL[m] ?? m).join(" · "),
            single: single ? SINGLE_SUBJECT_LABEL[single] : null,
          };
        })}
        metas={metas}
      />
    );
  };

  // 등록생 · 예비등록생은 레벨별 묶음 — 그 탭의 반(등록생은 수강 중인 반, 예비등록생은 개강 전 반)의 레벨. 졸업생 · 강사·조교 · 전체는 한 묶음
  const grouped = tab === "active" || tab === "preliminary";
  const cardLevels = (p: (typeof rows)[number]) =>
    (enrollByUser.get(p.id) ?? [])
      .map((e) => e.section)
      .filter((s): s is NonNullable<typeof s> => !!s && (tab === "active" ? s.enrollment_opens_at <= today && today <= s.closes_at : today < s.enrollment_opens_at))
      .map((s) => s.course?.target_score ?? null);
  const cardGroups = (
    grouped
      ? groupByLevel(rows, cardLevels, (p) => p.name ?? "")
      : [{ level: null, items: [...rows].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko")) }]
  ).map((g) => ({ key: String(g.level), label: g.level != null ? String(g.level) : "반 미배정", items: g.items }));

  return (
    <>
      <PageHeader
        icon="students"
        title="학생명단"
        description="등록생은 개강일~종강일 사이, 예비등록생은 개강 전 등록 완료, 졸업생은 종강일 경과 기준입니다. 레벨별 · 가나다순이고, PC 에서는 반별 명단(PDF · Word 로 받아 인쇄)이 먼저 보여요. 이름이나 카드를 누르면 등급·반 배정을 바꿉니다."
      >
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
        keep={{ q, view: view ?? undefined }}
        tabs={TABS.map((t) => ({
          ...t,
          count: t.value === "active" ? counts.active : t.value === "preliminary" ? counts.preliminary : t.value === "staff" ? (testerCount ?? undefined) : undefined,
        }))}
      />
      {tab === "staff" && (
        <p className="mb-4 rounded-xl2 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>강사</b>(이혜영 · 이영수) · <b>관리자</b> · <b>조교</b> 계정이에요. 강사·관리자는 이름을 눌러 <b>테스트 등급</b>(회원 · 수강생 · 졸업생)을 켜고 반을 배정하면,
          진짜 등급은 그대로 둔 채 학생이 보는 화면을 확인할 수 있어요. 이 계정들은 등록생 · 예비등록생 수에 세지 않습니다.
        </p>
      )}

      {rows.length === 0 && !(classRoster && classRoster.roster.total > 0) ? (
        <EmptyState icon="students" title={q ? `“${q}” 검색 결과가 없습니다` : "해당하는 학생이 없습니다"} description={tab === "active" ? "수강증 승인 후 개강일이 지나면 등록생으로 표시됩니다." : undefined} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-slate">
              {rows.length}명{rows.length === 300 && <span className="ml-1 font-semibold text-mist">(300명까지 보여요 — 이름으로 찾아보세요)</span>}
            </p>
            {classTab && (
              <RosterViewSwitch view={view} href={{ classes: href({ view: "classes" }), levels: href({ view: "levels" }), cards: href({ view: "cards" }) }} />
            )}
          </div>

          {/* 반별 명단 — 종이 명단처럼 칸 = 수업 한 반 (2026-10-14 Alan). 고르지 않으면 PC 에서만 보인다.
              레벨별 명단(칸 = 레벨 × 월수금 · 화목금)을 고르면 이 자리에 그것이 선다 */}
          {classTab && (
            <div className={cn("mb-6", view === "classes" || view === "levels" ? "" : view === "cards" ? "hidden" : "hidden lg:block")}>
              {rosterTerm && classRoster ? (
                <ClassRosterView
                  roster={classRoster.roster}
                  ok={classRoster.ok}
                  heading={`${rosterTerm.month}월 ${ROSTER_NAME[rosterBy]}`}
                  period={rosterPeriod(rosterTerm)}
                  terms={rosterOptions.map((t) => ({
                    key: termParam(t.year, t.month),
                    label: `${t.month}월`,
                    href: href({ term: termParam(t.year, t.month) }),
                    active: t.id === rosterTerm.id,
                  }))}
                  pdfHref={`/admin/students/roster-pdf?term=${termParam(rosterTerm.year, rosterTerm.month)}${rosterBy === "track" ? "&view=levels" : ""}`}
                  pdfName={rosterFileName(rosterTerm, rosterBy)}
                  docxHref={`/admin/students/roster-docx?term=${termParam(rosterTerm.year, rosterTerm.month)}${rosterBy === "track" ? "&view=levels" : ""}`}
                  docxName={rosterFileName(rosterTerm, rosterBy, "docx")}
                />
              ) : (
                <p className="card px-4 py-6 text-center text-sm text-slate">
                  지금 수업 중이거나 곧 시작하는 달이 없어요. 반 편성에서 다음 달을 열면 여기에 {ROSTER_NAME[rosterBy]}이 생겨요.
                </p>
              )}
            </div>
          )}

          {/* 카드 — 등록생 · 예비등록생은 레벨별 · 가나다순 (2026-10-14 Alan "레벨별로 가나다순으로"). 표가 아니라 카드다 — 휴대폰에서 옆으로 밀지 않고 한 화면에 다 보이게 (2026-09-18 Alan) */}
          <div className={cn(classTab && (view === "classes" || view === "levels" ? "hidden" : view === "cards" ? "" : "lg:hidden"))}>
            {cardGroups.map((g) => (
              <section key={g.key} aria-label={g.label} className={cn(grouped && "mb-6")}>
                {grouped && (
                  <h2 className="mb-2 flex items-baseline gap-1.5 text-sm font-black text-ink">
                    {g.label}
                    <span className="text-xs font-bold text-mist">{g.items.length}명</span>
                  </h2>
                )}
                <ul className="grid gap-3 lg:grid-cols-2">{g.items.map((p) => card(p))}</ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
