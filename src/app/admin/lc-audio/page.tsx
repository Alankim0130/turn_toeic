import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterTabs } from "@/components/admin/FilterTabs";
import { AudioUploader } from "@/components/admin/lc-audio/AudioUploader";
import { AudioTrackRow } from "@/components/admin/lc-audio/AudioTrackRow";
import { TextbookImages } from "@/components/admin/lc-audio/TextbookImages";
import { pickLevel, sortTracks } from "@/lib/lc-audio";

export const metadata: Metadata = { title: "LC 음원", robots: { index: false } };

export default async function LcAudioAdminPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: levelRows }, { data: allTracks }, { data: allImages }] = await Promise.all([
    supabase.from("lc_levels").select("level").order("sort_order").order("level"),
    supabase.from("lc_audio_tracks").select("id, title, level, file_name, file_size"),
    supabase.from("lc_textbook_images").select("id, level, file_name, created_at").order("created_at"),
  ]);
  const levels = (levelRows ?? []).map((l) => l.level);
  const level = pickLevel(sp.level, levels);

  const header = (
    <PageHeader icon="headphones" title="LC 음원" description="레벨(650 · 750 · 850)별로 교재 이미지와 음원을 올립니다. 지금 수강 중인 수강생은 LC 음원듣기에서 레벨을 골라 들어요." />
  );

  if (level === null) {
    return (
      <>
        {header}
        <EmptyState icon="headphones" title="등록된 레벨이 없어요" description="lc_levels 테이블에 레벨을 추가하면 여기에 탭이 생깁니다." />
      </>
    );
  }

  const tracks = sortTracks((allTracks ?? []).filter((t) => t.level === level));
  const images = (allImages ?? []).filter((i) => i.level === level);

  return (
    <>
      {header}
      <FilterTabs
        basePath="/admin/lc-audio"
        paramKey="level"
        current={String(level)}
        tabs={levels.map((l) => ({ value: String(l), label: String(l), count: (allTracks ?? []).filter((t) => t.level === l).length }))}
      />

      <section aria-labelledby="textbook-title" className="card mb-6 p-5 sm:p-6">
        <h2 id="textbook-title" className="text-base font-black text-ink">
          {level} 교재 이미지 <span className="text-sm font-semibold text-slate">({images.length})</span>
        </h2>
        <p className="mb-4 mt-1 text-sm text-slate">표지 사진을 올려 두면 학생이 자기 교재를 보고 음원을 찾기 쉬워요. 여러 장 올릴 수 있어요.</p>
        <TextbookImages level={level} images={images} />
      </section>

      <section aria-labelledby="audio-upload-title" className="card mb-6 p-5 sm:p-6">
        <h2 id="audio-upload-title" className="mb-3 text-base font-black text-ink">{level} 음원 올리기</h2>
        <AudioUploader key={level} level={level} />
      </section>

      <section aria-labelledby="audio-list-title">
        <h2 id="audio-list-title" className="mb-3 text-lg font-black text-ink">
          {level} 음원 <span className="text-slate">({tracks.length})</span>
        </h2>
        {tracks.length === 0 ? (
          <EmptyState icon="headphones" title={`${level} 음원이 아직 없어요`} description="위에서 음원 파일을 골라 올려 주세요." />
        ) : (
          <ul className="space-y-3">
            {tracks.map((t) => (
              <AudioTrackRow key={t.id} track={t} levels={levels} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
