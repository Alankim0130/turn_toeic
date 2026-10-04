import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { HandoverView, type HandoverCheckRow } from "@/components/admin/handover/HandoverView";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readHandover } from "../_lib/handover-doc";

export const metadata: Metadata = { title: "인수인계", robots: { index: false } };

/**
 * 인수인계 체크리스트 (2026-10-04 Alan — "햄버거 메뉴에서 인수인계 안보여"). 관리자 메뉴 `운영 → 인수인계`, 강사·관리자만.
 * 내용은 저장소의 docs/HANDOVER.md 를 그대로 그리고(`src/lib/handover.ts`), 체크는 DB `handover_checks` 에 저장한다 —
 * 넘겨주는 사람과 인수자(2단계에서 관리자가 된다)가 같은 진행 상황을 본다. 문서를 고치면 이 화면도 바뀐다.
 */
export default async function HandoverPage() {
  const { profile } = await requireStaff();
  const testing = profile.test_role != null;

  const doc = await readHandover().catch((e: unknown) => {
    console.error("[handover] docs/HANDOVER.md 를 읽지 못했다", e);
    return null;
  });
  if (!doc) {
    return (
      <>
        <PageHeader icon="admin" title="인수인계 체크리스트" />
        <p className="card p-5 text-sm text-slate">
          체크리스트 파일(<code className="font-mono text-ink">docs/HANDOVER.md</code>)을 읽지 못했어요. 잠시 뒤 새로고침해 주세요 — 계속되면 저장소의 같은 파일을
          GitHub 에서 열어 보면 내용은 그대로예요.
        </p>
      </>
    );
  }

  // 테스트 등급을 켜면 RLS 가 학생으로 보아 체크가 0건으로 읽힌다 — 읽지 않고 안내한다 (자동 판정 스위치와 같은 규칙)
  let checks = new Map<string, HandoverCheckRow>();
  let loadError = false;
  if (!testing) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("handover_checks").select("item, checked_name, checked_at");
    if (error) loadError = true;
    else checks = new Map(data.map((c) => [c.item, c]));
  }

  return (
    <>
      <PageHeader
        icon="admin"
        title="인수인계 체크리스트"
        description="위에서부터 하나씩 끝내고 체크해요. 체크는 저장돼서 넘겨주는 사람과 인수자가 같은 진행 상황을 봐요."
      />

      <HandoverView doc={doc} checks={checks} testing={testing} loadError={loadError} />
    </>
  );
}
