import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { ClassMaterialUpload } from "@/components/admin/class-materials/ClassMaterialUpload";
import { ClassMaterialRow } from "@/components/admin/class-materials/ClassMaterialRow";
import { isMaterialSubject, MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { requireStaff } from "@/lib/auth";

export const metadata: Metadata = { title: "수업자료실", robots: { index: false } };

/**
 * 수업자료실 (2026-10-05 Alan — "지금 수업자료실이 없어! 수업자료실을 하나 만들어야하는데, 레벨별 구분과 RC, LC가 구분되어야해.").
 * **레벨이 먼저, 그 안에서 RC · LC** — Alan 이 말한 순서다. 레벨은 교재 레벨 목록(lc_levels)에서 읽는다 (코드에 650 · 750 · 850 을 적지 않는다).
 * 강사는 **자기 과목부터** 본다(`profiles.subject` — 숙제점검과 같은 규칙), 관리자는 RC 부터.
 * 올린 자료는 그 레벨을 수강 중인 학생의 `/my/materials` 에 바로 선다 — 학생에게는 DB 가 내 레벨만 연다 (마이그레이션 20261005100000).
 * 강사·관리자만 — 조교 화면이 아니다 (관리자 화면 여섯 가지는 Alan 이 정했다).
 */
export default async function ClassMaterialsAdminPage({ searchParams }: { searchParams: Promise<{ level?: string; subject?: string }> }) {
  // 레이아웃이 조교를 통과시키므로 화면마다 막는다
  const { profile } = await requireStaff();
  // 테스트 등급을 켜면 RLS 가 학생으로 본다 — 내 레벨만 보이고 올리기 · 고치기가 막힌다. 그대로 두되 까닭을 말한다
  const testing = profile.test_role != null;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: levelRows } = await supabase.from("lc_levels").select("level").order("sort_order").order("level");
  const levels = (levelRows ?? []).map((l) => l.level);
  const level = levels.includes(Number(sp.level)) ? Number(sp.level) : (levels[0] ?? null);
  const mySubject = isMaterialSubject(profile.subject) ? profile.subject : null;
  const subject: MaterialSubject = (isMaterialSubject(sp.subject) ? sp.subject : null) ?? mySubject ?? MATERIAL_SUBJECTS[0];
  const defaulted = !sp.subject && mySubject !== null;

  const header = (
    <PageHeader
      icon="download"
      title="수업자료실"
      description="레벨 → RC · LC 를 고른 뒤 자료를 올려요. 그 레벨을 수강 중인 학생의 수업자료실에 바로 보여요."
    />
  );

  if (level === null) {
    return (
      <>
        {header}
        <EmptyState icon="warning" title="레벨 목록을 읽지 못했어요" description="잠시 뒤 새로고침해 주세요. 레벨은 LC 음원과 같은 교재 레벨 목록을 써요." />
      </>
    );
  }

  /** 칸 숫자 = 그 칸에 올라온 자료 수 (다른 축은 지금 보고 있는 값 그대로 — 숙제점검과 같은 규칙) */
  const count = async (l: number, s: MaterialSubject) =>
    (await supabase.from("class_materials").select("id", { count: "exact", head: true }).eq("level", l).eq("subject", s)).count ?? 0;

  const [{ data: rows, error }, levelCounts, subjectCounts] = await Promise.all([
    supabase
      .from("class_materials")
      .select("id, level, subject, title, note, file_name, file_size, content_type, created_at, updated_at")
      .eq("level", level)
      .eq("subject", subject)
      .order("created_at", { ascending: false }),
    Promise.all(levels.map(async (l) => [l, await count(l, subject)] as const)),
    Promise.all(MATERIAL_SUBJECTS.map(async (s) => [s, await count(level, s)] as const)),
  ]);
  const byLevel = new Map(levelCounts);
  const bySubject = new Map(subjectCounts);
  const list = rows ?? [];
  const cellLabel = `${level} ${MATERIAL_SUBJECT_LABEL[subject]}`;

  return (
    <>
      {header}

      {/* **레벨이 먼저, 그 안에서 RC · LC** (Alan 이 말한 순서). 첫째 줄은 채운 세그먼트, 둘째 줄은 테두리 (FilterTabs 무게 규칙) */}
      <FilterTabs
        basePath="/admin/class-materials"
        paramKey="level"
        current={String(level)}
        keep={{ subject }}
        tabs={levels.map((l) => ({ value: String(l), label: `${l}`, count: byLevel.get(l) ?? 0 }))}
      />
      <FilterTabs
        basePath="/admin/class-materials"
        paramKey="subject"
        current={subject}
        keep={{ level: String(level) }}
        variant="outline"
        tabs={MATERIAL_SUBJECTS.map((s) => ({ value: s, label: `${MATERIAL_SUBJECT_LABEL[s]} 자료`, count: bySubject.get(s) ?? 0 }))}
      />

      {/* 기본값으로 걸린 과목은 말해 준다 — 안 그러면 다른 과목 자료가 사라진 것처럼 보인다 */}
      {defaulted && <p className="-mt-1 mb-3 text-xs text-mist">내 과목({MATERIAL_SUBJECT_LABEL[subject]}) 자료부터 보여 주고 있어요. 위에서 레벨 · 과목을 바꿀 수 있어요.</p>}

      <div className="space-y-4">
        <p className="text-sm text-slate">
          <span className="font-black text-ink">{cellLabel}</span> 자료 <strong className="text-brand-600">{list.length}</strong>개 · {level} 반을 수강 중인 학생에게
          개강일부터 종강일까지 보여요 (속성반 학생은 함께 듣는 레벨 자료도 봐요).
        </p>

        {testing ? (
          <p className="card p-4 text-sm text-slate">
            테스트 등급을 켠 동안에는 학생처럼 <strong className="text-ink">내 레벨 자료만</strong> 보이고 올리기 · 고치기를 할 수 없어요. 위 띠에서 테스트를 끝내면 돼요.
          </p>
        ) : (
          // 칸이 바뀌면 폼을 새로 그린다 (고른 파일 · 적던 글이 다른 칸으로 따라가지 않게)
          <ClassMaterialUpload key={`${level}-${subject}`} level={level} subject={subject} cellLabel={cellLabel} />
        )}

        {error ? (
          <EmptyState icon="warning" title="자료를 불러오지 못했어요" description="잠시 뒤 새로고침해 주세요." />
        ) : list.length === 0 ? (
          <EmptyState icon="download" title={`아직 올린 ${cellLabel} 자료가 없어요`} description="위에서 파일을 고르고 올리면 학생 수업자료실에 바로 보여요." />
        ) : (
          <ul className="space-y-3">
            {list.map((m) => (
              <ClassMaterialRow key={`${m.id}-${m.updated_at}`} item={m} levels={levels} disabled={testing} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
