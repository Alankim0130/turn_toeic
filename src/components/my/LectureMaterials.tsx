import { formatDate } from "@/lib/utils";
import { formatBytes } from "@/lib/study";
import { linkCountLabel, materialBadge } from "@/lib/class-materials";
import { lectureMaterialsTitle, type LectureMaterial } from "@/lib/lecture-materials";
import { MaterialNote } from "@/components/class-materials/MaterialNote";
import { MaterialFileList } from "@/components/class-materials/MaterialFileList";
import { MaterialLinkList } from "@/components/class-materials/MaterialLinkList";
import { cn } from "@/lib/utils";

/**
 * **특강 자료실 — 학생 카드 안** (2026-10-30 Alan — "특강신청한 사람들이 특강 신청한 곳에 들어가면 볼 수 있는 자료실이 하나 있으면 좋겠어!
 * 다른사람들 말고 신청한 사람들만 보이는 자료실이야"). 특강 신청 화면(`/my/lecture`)의 **내가 신청한 특강 카드** 안에 선다.
 * 자료 카드는 수업자료실(`MaterialCard`)처럼 **닫힌 채로** 서고 누른 카드만 열린다 — 특강 카드가 길어지지 않게.
 * 누가 보는지는 DB 가 정한다 (정책 `special_lecture_materials: 신청자·스태프 조회`) — 이 조각은 신청한 특강의 자료만 받는다 (`getMyLectureMaterials`).
 * 파일은 `/files/lecture/{파일 id}` — 신청하지 않은 특강의 파일은 404.
 */
export function LectureMaterials({ materials }: { materials: readonly LectureMaterial[] }) {
  if (materials.length === 0) return null;
  return (
    <section aria-label="특강 자료실" className="rounded-xl border border-brand-200 bg-paper p-3">
      <p className="text-xs font-black text-brand-700">
        {lectureMaterialsTitle(materials.length)} <span className="font-semibold text-slate">· 신청한 학생에게만 보여요</span>
      </p>
      <ul className="mt-2 space-y-2">
        {materials.map((m) => {
          const single = m.files.length === 1 ? m.files[0] : null;
          return (
            <li key={m.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <details className="group/card">
                <summary className="flex cursor-pointer list-none items-center gap-2.5 p-2.5 transition hover:bg-brand-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 [&::-webkit-details-marker]:hidden">
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-black ring-1",
                      m.files.length + m.links.length === 0 ? "bg-paper text-slate ring-line" : "bg-brand-50 text-brand-700 ring-brand-100",
                    )}
                  >
                    {materialBadge(m.files, m.links)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-black leading-snug text-ink [overflow-wrap:anywhere]">{m.title}</span>
                    <span className="mt-0.5 block text-[11px] text-slate">
                      {formatDate(new Date(m.created_at), { month: "long", day: "numeric" })} 올림
                      {single?.file_size != null && <> · {formatBytes(single.file_size)}</>}
                      {m.files.length > 1 && <> · 파일 {m.files.length}개</>}
                      {m.links.length > 0 && <> · {linkCountLabel(m.links)}</>}
                    </span>
                  </span>
                  <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper text-slate ring-1 ring-line transition group-open/card:rotate-180">
                    <svg viewBox="0 0 24 24" className="size-3.5 fill-none stroke-current stroke-[2.5]">
                      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div className="space-y-2 px-2.5 pb-3">
                  {m.note && <MaterialNote note={m.note} linkify className="bg-brand-50" />}
                  {m.files.length > 0 && <MaterialFileList files={m.files} base="/files/lecture" />}
                  {m.links.length > 0 && <MaterialLinkList links={m.links} />}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
