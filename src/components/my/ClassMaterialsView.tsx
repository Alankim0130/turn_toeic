import Link from "next/link";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { cn, formatDate } from "@/lib/utils";
import { formatBytes } from "@/lib/study";
import { shortDay } from "@/lib/study-rounds";
import { fileKindLabel, MATERIAL_SUBJECT_LABEL, MATERIAL_SUBJECTS, type MaterialSubject } from "@/lib/class-materials";
import { ROUND_SET_LABEL, type RoundSet } from "@/lib/class-rounds";
import { MaterialNote } from "@/components/class-materials/MaterialNote";

export type MyClassMaterial = {
  id: number;
  title: string;
  note: string | null;
  file_name: string;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
};

/** 일정표 한 줄 — 내 수업일 하나 = 한 회차 (과정 A/B · 회차 · 그 과정을 쓰는 내 수업 시간) */
export type MaterialRound = { key: string; date: string; set: RoundSet; seq: number; time: string | null };

/** 다음 수업일은 이만큼만 펼친다 — 주5일 120분이면 한 달에 열몇 줄이라 다 펴면 받을 자료가 아래로 밀린다 */
const UPCOMING_SHOWN = 3;

/** 브라우저가 그 자리에서 보여 주는 형식 — 나머지(한글 · 워드 · 압축 …)는 어차피 내려받아지므로 `받기` 하나만 둔다 */
const VIEWABLE = new Set(["PDF", "그림"]);

/**
 * 학생 수업자료실의 레벨 칸 · RC/LC 칸 · **일정표** (2026-10-05). 데이터는 `/my/materials` 가 내 과정 칸 · 열린 회차로 좁혀 넘긴다 —
 * 여기서는 그리기만 한다 (조회하지 않는다).
 * **회차마다 그 수업일에 열린다** (2026-10-05 Alan — "자료게시판도 일정표 기반으로 오픈하는 걸로 하고, 해당 날짜가 안되면 잠금이고,
 * 해당날짜 수업이 진행되면 하나씩 오픈"): 위에는 열린 회차(자료가 있는 것)를 최근 수업일부터, 아래에는 다음 수업일들을 자물쇠와 함께.
 * 그 레벨에서 내가 듣지 않는 과목(RC 단과의 LC)은 **잠긴 칸**으로 선다 — 누를 수 없고 숫자도 적지 않는다 (DB 가 닫아 둬 셀 수도 없다).
 */
export function ClassMaterialsView({
  levels,
  level,
  subjects,
  subject,
  counts,
  today,
  opened,
  upcoming,
}: {
  /** 내 레벨 (속성반이면 둘) — 하나뿐이면 레벨 칸을 숨긴다 */
  levels: number[];
  level: number;
  /** 이 레벨에서 내가 듣는 과목 — RC 단과면 RC 하나 */
  subjects: MaterialSubject[];
  subject: MaterialSubject;
  /** 지금 레벨의 과목별 열린 자료 수 (내가 듣는 과목만) */
  counts: Partial<Record<MaterialSubject, number>>;
  today: string;
  /** 열린 회차 중 자료가 있는 것 — 최근 수업일부터 */
  opened: (MaterialRound & { items: MyClassMaterial[] })[];
  /** 아직 오지 않은 수업일 — 날짜순 */
  upcoming: MaterialRound[];
}) {
  const href = (l: number, s: MaterialSubject) => `/my/materials?level=${l}&subject=${s}`;
  const closed = MATERIAL_SUBJECTS.filter((s) => !subjects.includes(s));
  const roundLabel = (r: MaterialRound) => `${ROUND_SET_LABEL[r.set]} ${r.seq}회차`;
  const later = upcoming.length - UPCOMING_SHOWN;
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

      {/* RC · LC — 칸을 똑같이 나눠 한 줄을 채운다. 숫자는 그 과목에 열린 자료 수 (빈 칸을 눌러 보지 않아도 알게).
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
        자료는 <strong className="text-ink">내 수업일마다 그 회차 자료가 하나씩</strong> 열려요.
        {/* 왜 한 칸이 잠겼는지 — RC 단과면 "내 650 수업은 RC라 …" (2026-10-05 Alan "RC단과 학생들은 … LC수업자료실에 접근 안되는거 맞지?").
            잠긴 칸은 많아야 하나다 (과목이 하나도 없는 레벨은 애초에 들지 않는다) */}
        {closed.length > 0 && (
          <span className="mt-1 block text-xs text-mist">
            내 {level} 수업은 {MATERIAL_SUBJECT_LABEL[subjects[0]]}라 {MATERIAL_SUBJECT_LABEL[closed[0]]} 자료는 열리지 않아요 — {MATERIAL_SUBJECT_LABEL[closed[0]]} 수업을
            듣는 수강생에게 열려요.
          </span>
        )}
      </p>

      {/* 열린 회차 — 자료가 있는 것만, 최근 수업일부터 */}
      {opened.length === 0 ? (
        <EmptyState
          icon="download"
          title={`아직 열린 ${level} ${MATERIAL_SUBJECT_LABEL[subject]} 자료가 없어요`}
          description={upcoming.length ? `다음 수업일 ${shortDay(upcoming[0].date)}에 그 회차 자료가 열려요.` : "강사님이 자료를 올리면 수업일마다 여기에서 받을 수 있어요."}
        />
      ) : (
        <ol className="space-y-4" aria-label="열린 수업 자료">
          {opened.map((r) => (
            <li key={r.key} className="space-y-2">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-black tabular-nums text-ink">{shortDay(r.date)}</span>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-black text-brand-700">{roundLabel(r)}</span>
                {r.time && <span className="text-xs text-slate">{r.time}</span>}
                {r.date === today && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-black text-white">오늘</span>}
              </p>
              <ul className="space-y-2">
                {r.items.map((m) => (
                  <MaterialCard key={m.id} m={m} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {/* 다음 수업일 — 수업일 전에는 잠금 (자료가 있는지는 그날 알 수 있다) */}
      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-title" className="rounded-xl2 border border-line bg-paper p-4">
          <h2 id="upcoming-title" className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">
            <Icon name="lock" size={16} />
            다음 수업 자료 — 수업일에 열려요
          </h2>
          <ul className="divide-y divide-line">
            {upcoming.slice(0, UPCOMING_SHOWN).map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm text-slate">
                <span className="font-bold tabular-nums text-ink-soft">{shortDay(r.date)}</span>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-slate ring-1 ring-line">{roundLabel(r)}</span>
                {r.time && <span className="text-xs text-mist">{r.time}</span>}
              </li>
            ))}
          </ul>
          {later > 0 && <p className="mt-1 text-xs text-mist">이후 수업 {later}회도 수업일마다 하나씩 열려요.</p>}
        </section>
      )}

      <p className="text-xs text-mist">수업 자료는 수강생 본인만 이용할 수 있어요. 파일을 외부에 공유하지 마세요.</p>
    </>
  );
}

function MaterialCard({ m }: { m: MyClassMaterial }) {
  const kind = fileKindLabel(m.file_name, m.content_type);
  const viewable = VIEWABLE.has(kind);
  return (
    // 휴대폰: 제목 → 안내 → 버튼. 넓은 화면: 제목 줄 오른쪽에 버튼, 안내는 그 아래 한 줄 전체 (버튼만 따로 한 줄을 먹지 않게)
    <li className="card grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
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
      {/* 강사가 적은 안내 · 스크립트 — 짧으면 펼쳐 두고, 길면 앞 네 줄 + 전체 보기 (2026-10-05) */}
      {m.note && <MaterialNote note={m.note} className="bg-brand-50 sm:col-span-2 sm:row-start-2" />}
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
}
