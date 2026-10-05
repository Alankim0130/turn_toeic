import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { formatBytes } from "@/lib/study";
import { fileKindLabel, MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";

export type MyClassMaterial = {
  id: number;
  title: string;
  note: string | null;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
};

/** 브라우저가 그 자리에서 보여 주는 형식 — 나머지(한글 · 워드 · 압축 …)는 어차피 내려받아지므로 `받기` 하나만 둔다 */
const VIEWABLE = new Set(["PDF", "그림"]);

/**
 * 학생 수업자료실의 레벨 칸 · RC/LC 칸 · 자료 목록 (2026-10-05). 데이터는 `/my/materials` 가 내 레벨 × 과목으로 좁혀 넘긴다 —
 * 여기서는 그리기만 한다 (조회하지 않는다).
 * 그 레벨에서 내가 듣지 않는 과목(RC 단과의 LC)은 **잠긴 칸**으로 선다 — 누를 수 없고 숫자도 적지 않는다 (DB 가 닫아 둬 셀 수도 없다).
 */
export function ClassMaterialsView({
  levels,
  level,
  subjects,
  subject,
  counts,
  list,
}: {
  /** 내 레벨 (속성반이면 둘) — 하나뿐이면 레벨 칸을 숨긴다 */
  levels: number[];
  level: number;
  /** 이 레벨에서 내가 듣는 과목 — RC 단과면 RC 하나 */
  subjects: MaterialSubject[];
  subject: MaterialSubject;
  /** 지금 레벨의 과목별 자료 수 (내가 듣는 과목만) */
  counts: Partial<Record<MaterialSubject, number>>;
  /** 지금 레벨 · 과목의 자료 (최근에 올린 것이 위) */
  list: MyClassMaterial[];
}) {
  const href = (l: number, s: MaterialSubject) => `/my/materials?level=${l}&subject=${s}`;
  const closed = MATERIAL_SUBJECTS.filter((s) => !subjects.includes(s));
  return (
    <>
      {/* 레벨이 여러 개일 때만 고르게 한다 (속성반 — 함께 듣는 레벨). 한 개면 숨긴다 */}
      {levels.length > 1 && (
        <nav aria-label="레벨" className="flex flex-wrap gap-2">
          {levels.map((l) => (
            <Link
              key={l}
              href={href(l, subject)}
              aria-current={l === level ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-black tabular-nums transition",
                l === level ? "bg-brand-500 text-white shadow-pink" : "bg-surface text-slate ring-1 ring-line hover:text-brand-600",
              )}
            >
              {l}
            </Link>
          ))}
        </nav>
      )}

      {/* RC · LC — 칸을 똑같이 나눠 한 줄을 채운다. 숫자는 그 과목에 올라온 자료 수 (빈 칸을 눌러 보지 않아도 알게).
          내가 듣지 않는 과목은 잠긴 칸 — 칸을 빼면 한 칸짜리 줄이 되어 "LC 는 어디 있지?" 를 찾게 된다 */}
      <nav aria-label="과목" className="grid grid-cols-2 gap-1.5 rounded-2xl bg-brand-50 p-1">
        {MATERIAL_SUBJECTS.map((s) => {
          if (!subjects.includes(s)) {
            return (
              <span
                key={s}
                aria-disabled="true"
                title={`${MATERIAL_SUBJECT_LABEL[s]} 수업을 듣는 수강생에게 열려요`}
                className="flex items-center justify-center gap-2 rounded-xl2 px-2 py-2.5 text-sm font-black text-mist"
              >
                <Icon name="lock" size={16} />
                {MATERIAL_SUBJECT_LABEL[s]} 자료
              </span>
            );
          }
          const active = s === subject;
          return (
            <Link
              key={s}
              href={href(level, s)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl2 px-2 py-2.5 text-sm font-black transition",
                active ? "bg-brand-500 text-white shadow-pink" : "text-ink-soft hover:bg-white/70 hover:text-brand-600",
              )}
            >
              <Icon name={s} size={20} className={active ? "brightness-0 invert" : undefined} />
              {MATERIAL_SUBJECT_LABEL[s]} 자료
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] tabular-nums", active ? "bg-white/25 text-white" : "bg-white text-ink-soft")}>{counts[s] ?? 0}</span>
            </Link>
          );
        })}
      </nav>

      <p className="text-sm text-slate">
        <span className="font-bold text-ink">
          {level} · {MATERIAL_SUBJECT_LABEL[subject]}
        </span>{" "}
        자료예요 · 최근에 올라온 자료가 위에 있어요.
        {/* 왜 한 칸이 잠겼는지 — RC 단과면 "내 650 수업은 RC라 …" (2026-10-05 Alan "RC단과 학생들은 … LC수업자료실에 접근 안되는거 맞지?").
            잠긴 칸은 많아야 하나다 (과목이 하나도 없는 레벨은 애초에 들지 않는다) */}
        {closed.length > 0 && (
          <span className="mt-1 block text-xs text-mist">
            내 {level} 수업은 {MATERIAL_SUBJECT_LABEL[subjects[0]]}라 {MATERIAL_SUBJECT_LABEL[closed[0]]} 자료는 열리지 않아요 — {MATERIAL_SUBJECT_LABEL[closed[0]]} 수업을
            듣는 수강생에게 열려요.
          </span>
        )}
      </p>

      {list.length === 0 ? (
        <EmptyState
          icon="download"
          title={`아직 올라온 ${level} ${MATERIAL_SUBJECT_LABEL[subject]} 자료가 없어요`}
          description="강사님이 자료를 올리면 여기에서 바로 받을 수 있어요."
        />
      ) : (
        <ul className="space-y-3">
          {list.map((m) => {
            const kind = fileKindLabel(m.file_name, m.content_type);
            const viewable = VIEWABLE.has(kind);
            return (
              // 휴대폰: 제목 → 안내 → 버튼. 넓은 화면: 제목 줄 오른쪽에 버튼, 안내는 그 아래 한 줄 전체 (버튼만 따로 한 줄을 먹지 않게)
              <li key={m.id} className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <div className="flex min-w-0 items-start gap-3 sm:col-start-1 sm:row-start-1">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-[11px] font-black text-brand-700 ring-1 ring-brand-100">
                    {kind}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black leading-snug text-ink [overflow-wrap:anywhere]">{m.title}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {formatDate(new Date(m.created_at), { month: "long", day: "numeric" })} 올림
                      {m.file_size != null && <> · {formatBytes(m.file_size)}</>}
                    </p>
                  </div>
                </div>
                {/* 강사가 적은 안내 — 접지 않는다 */}
                {m.note && (
                  <p className="whitespace-pre-wrap rounded-xl bg-brand-50 px-3 py-2 text-sm leading-relaxed text-ink-soft [overflow-wrap:anywhere] sm:col-span-2 sm:row-start-2">
                    <span className="mr-1.5 text-xs font-black text-brand-700">안내</span>
                    {m.note}
                  </p>
                )}
                <div className={cn("grid gap-2 sm:col-start-2 sm:row-start-1 sm:flex", viewable ? "grid-cols-2" : "grid-cols-1")}>
                  {viewable && (
                    <a href={`/files/class/${m.id}`} target="_blank" rel="noopener" className="btn-secondary !px-4 !py-2 text-sm">
                      열기
                    </a>
                  )}
                  <a href={`/files/class/${m.id}?download=1`} className="btn-primary !px-4 !py-2 text-sm">
                    <Icon name="download" size={18} className="brightness-0 invert" />
                    받기
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-mist">수업 자료는 수강생 본인만 이용할 수 있어요. 파일을 외부에 공유하지 마세요.</p>
    </>
  );
}
