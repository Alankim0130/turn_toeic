import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { todayKST } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { TermChips } from "@/components/admin/TermChips";
import { AudioUploader } from "@/components/admin/lc-audio/AudioUploader";
import { AudioTrackRow } from "@/components/admin/lc-audio/AudioTrackRow";
import { termParam } from "@/lib/study";
import { pickTerm, termLabel } from "../_lib/queries";

export const metadata: Metadata = { title: "LC 음원", robots: { index: false } };

export default async function LcAudioAdminPage({ searchParams }: { searchParams: Promise<{ term?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = todayKST();

  const { data: terms } = await supabase.from("terms").select("id, year, month").order("year", { ascending: false }).order("month", { ascending: false }).limit(24);
  const always = sp.term === "always";
  const term = always ? null : pickTerm(terms ?? [], sp.term, today);
  const target = always || !term ? null : term;
  const targetLabel = target ? `${termLabel(target)} 수강생용` : "상시 음원 (현재 수강생 전체)";

  let query = supabase.from("lc_audio_tracks").select("id, title, date, term_id, file_name, file_size").order("date", { ascending: true, nullsFirst: true }).order("created_at");
  query = target ? query.eq("term_id", target.id) : query.is("term_id", null);
  const { data: tracks } = await query;

  const termOptions = (terms ?? []).map((t) => ({ id: t.id, label: termLabel(t) }));

  return (
    <>
      <PageHeader icon="headphones" title="LC 음원" description="수강생이 LC 음원듣기에서 재생할 음원을 올립니다. 기수를 고르면 그 달 수강생에게, 상시 음원은 현재 수강 중인 모든 수강생에게 보여요." />

      <TermChips basePath="/admin/lc-audio" terms={terms ?? []} current={target ? termParam(target.year, target.month) : "always"} extra={{ value: "always", label: "상시 음원" }} />

      <section aria-labelledby="audio-upload-title" className="card mb-6 p-5 sm:p-6">
        <h2 id="audio-upload-title" className="mb-3 text-base font-black text-ink">
          음원 올리기 <span className="text-sm font-semibold text-slate">— {targetLabel}</span>
        </h2>
        <AudioUploader termId={target?.id ?? null} targetLabel={targetLabel} />
      </section>

      <section aria-labelledby="audio-list-title">
        <h2 id="audio-list-title" className="mb-3 text-lg font-black text-ink">
          올린 음원 <span className="text-slate">({tracks?.length ?? 0})</span>
        </h2>
        {(tracks ?? []).length === 0 ? (
          <EmptyState icon="headphones" title="아직 올린 음원이 없어요" description="위에서 음원 파일을 골라 올려 주세요." />
        ) : (
          <ul className="space-y-3">
            {(tracks ?? []).map((t) => (
              <AudioTrackRow key={t.id} track={t} termOptions={termOptions} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
