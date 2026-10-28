import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { DonutChart } from "@/components/admin/charts/DonutChart";
import { BarChart } from "@/components/admin/charts/BarChart";
import { ColumnChart } from "@/components/admin/charts/ColumnChart";
import { countBy, GENDER_LABEL } from "../_lib/queries";
import { isCrew, requireStaff } from "@/lib/auth";
import { labelOf, OCCUPATIONS, REASONS, SOURCES } from "@/lib/student-survey";

export const metadata: Metadata = { title: "마케팅 분석", robots: { index: false } };

const SCOPES = [
  { value: "all", label: "전체 가입 회원" },
  { value: "students", label: "등록 이력 있는 회원" },
];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  // 조교는 이 화면을 쓸 수 없다 — 레이아웃이 조교를 통과시키므로 화면마다 막는다
  await requireStaff();
  const { scope: scopeParam } = await searchParams;
  const scope = scopeParam === "students" ? "students" : "all";
  const supabase = await createClient();

  const [{ data: profiles }, { data: orders }, { data: surveyRows }] = await Promise.all([
    supabase.from("profiles").select("id, gender, university, department, created_at, role").limit(5000),
    scope === "students" ? supabase.from("enrollment_orders").select("user_id") : Promise.resolve({ data: [] as { user_id: string }[] }),
    // 수강생 설문 (2026-10-28) — 수강 계기 · 지금 하는 일 · 공부 이유. 강사 · 관리자 세션으로 읽는다 (정책이 강사 · 관리자 · 본인만)
    supabase.from("student_surveys").select("occupation, reasons, sources, user:profiles!student_surveys_user_id_fkey(role, merged_into)").limit(5000),
  ]);

  let rows = (profiles ?? []).filter((p) => p.role !== "instructor" && p.role !== "admin");
  if (scope === "students") {
    const ids = new Set((orders ?? []).map((o) => o.user_id));
    rows = rows.filter((p) => ids.has(p.id));
  }

  const gender = countBy(rows, (p) => (p.gender ? GENDER_LABEL[p.gender] ?? p.gender : "미응답"), "미응답");
  const university = countBy(rows, (p) => p.university).slice(0, 10);
  const department = countBy(rows, (p) => p.department).slice(0, 10);

  // 최근 12개월 가입 추이 (KST)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}` });
  }
  const signupsByMonth = new Map(months.map((m) => [m.key, 0]));
  for (const p of rows) {
    const key = new Date(p.created_at).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 7);
    if (signupsByMonth.has(key)) signupsByMonth.set(key, (signupsByMonth.get(key) ?? 0) + 1);
  }
  const signups = months.map((m) => ({ label: m.label, value: signupsByMonth.get(m.key) ?? 0 }));

  // 설문은 학생만 한다 — 그래도 강사 · 관리자 · 조교 계정과 합쳐진 옛 계정의 줄은 세지 않는다 (같은 사람을 두 번 세지 않게)
  const surveys = (surveyRows ?? []).filter((r) => r.user && !isCrew(r.user.role) && !r.user.merged_into);
  const tally = (pick: (r: (typeof surveys)[number]) => readonly string[], list: Parameters<typeof labelOf>[0]) => {
    const m = new Map<string, number>();
    for (const r of surveys) for (const k of pick(r)) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].map(([k, value]) => ({ label: labelOf(list, k), value })).sort((a, b) => b.value - a.value);
  };
  const sources = tally((r) => r.sources, SOURCES);
  const reasons = tally((r) => r.reasons, REASONS);
  const occupations = tally((r) => [r.occupation], OCCUPATIONS);

  const filled = {
    university: rows.filter((p) => p.university?.trim()).length,
    department: rows.filter((p) => p.department?.trim()).length,
    gender: rows.filter((p) => p.gender && p.gender !== "undisclosed").length,
  };

  return (
    <>
      <PageHeader icon="analytics" title="마케팅 분석" description="회원가입 때 입력한 대학·학과·성별 통계입니다. 강사·관리자 계정은 제외됩니다." />
      <FilterTabs basePath="/admin/analytics" paramKey="scope" current={scope} tabs={SCOPES} />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="분석 대상" value={rows.length} />
        <Stat label="대학 입력" value={filled.university} of={rows.length} />
        <Stat label="학과 입력" value={filled.department} of={rows.length} />
        <Stat label="성별 응답" value={filled.gender} of={rows.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <ChartTitle icon="profile" title="성별" />
          <DonutChart title="성별" data={gender} table="visible" />
        </section>
        <section className="card p-5">
          <ChartTitle icon="calendar" title="월별 가입 추이 (최근 12개월)" />
          <ColumnChart title="월별 가입 추이" data={signups} table="visible" />
        </section>
        <section className="card p-5">
          <ChartTitle icon="location" title="대학 TOP 10" />
          <BarChart title="대학 TOP 10" data={university} table="visible" />
        </section>
        <section className="card p-5">
          <ChartTitle icon="students" title="학과 TOP 10" />
          <BarChart title="학과 TOP 10" data={department} table="visible" />
        </section>
      </div>
      <p className="mt-4 text-xs text-mist">“미입력”은 가입 시 해당 항목을 비워 둔 회원입니다.</p>

      {/* 수강생 설문 (2026-10-28 Alan — OT 설문을 웹으로). 등업 직후 처음 한 번 — 여러 개 고르는 질문은 고른 사람 수로 센다 */}
      <h2 className="mb-1 mt-10 text-lg font-black text-ink">수강생 설문</h2>
      <p className="mb-4 text-sm text-slate">
        설문한 수강생 <b className="tabular-nums text-ink">{surveys.length.toLocaleString("ko-KR")}</b>명 · 수강 계기와 공부 이유는 여러 개 고를 수 있어 합이 사람 수보다 많아요.
      </p>
      {surveys.length === 0 ? (
        <p className="card p-5 text-sm text-slate">아직 설문한 수강생이 없어요.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-5 lg:col-span-2">
            <ChartTitle icon="contact" title="수강 계기 (어떻게 알게 됐나)" />
            <BarChart title="수강 계기" data={sources} table="visible" />
          </section>
          <section className="card p-5">
            <ChartTitle icon="profile" title="지금 하는 일" />
            <DonutChart title="지금 하는 일" data={occupations} table="visible" />
          </section>
          <section className="card p-5">
            <ChartTitle icon="target" title="토익 공부 이유" />
            <BarChart title="토익 공부 이유" data={reasons} table="visible" />
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold text-slate">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-ink">
        {value.toLocaleString("ko-KR")}
        <span className="ml-1 text-sm font-semibold text-slate">명{typeof of === "number" && of > 0 ? ` (${Math.round((value / of) * 100)}%)` : ""}</span>
      </p>
    </div>
  );
}

function ChartTitle({ icon, title }: { icon: "profile" | "calendar" | "location" | "students" | "contact" | "target"; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon name={icon} size={26} />
      <h2 className="font-black text-ink">{title}</h2>
    </div>
  );
}
