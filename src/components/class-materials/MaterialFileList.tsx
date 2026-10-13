import { Icon } from "@/components/ui/Icon";
import { fileKindLabel, isViewableKind, type MaterialFile } from "@/lib/class-materials";
import { formatBytes } from "@/lib/study";
import { cn } from "@/lib/utils";

/**
 * 수업자료실 자료에 붙은 파일 목록 (2026-10-06 — 자료 하나에 파일 여러 개). 파일마다 종류 · 이름 · 크기 · 열기(PDF · 그림만) · 받기.
 * 학생 화면(`ClassMaterialsView`)과 관리자 줄(`ClassMaterialRow`)이 함께 쓴다. 주소의 숫자는 **파일 id** 다(`/files/class/{id}`) —
 * 자료가 보이는 사람에게만 열린다 (`class_material_files` 조회 정책). 공지 첨부 파일(2026-10-13)은 `base="/files/notice"` 로 같은 목록을 쓴다
 * (`class_notice_files` — 그 공지가 보이는 사람에게만).
 * 이름은 길어도 줄을 넘겨 다 보인다 — 같은 회차에 `1강 스크립트.pdf` · `1강 해설.pdf` 처럼 앞이 같은 파일이 많다
 */
export function MaterialFileList({
  files,
  className,
  base = "/files/class",
}: {
  files: readonly MaterialFile[];
  className?: string;
  /** 파일 주소 앞부분 — 수업자료는 `/files/class`, 공지 첨부 파일은 `/files/notice` (2026-10-13) */
  base?: "/files/class" | "/files/notice";
}) {
  return (
    <ul aria-label="첨부 파일" className={cn("divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper", className)}>
      {files.map((f) => {
        const kind = fileKindLabel(f.file_name, f.content_type);
        return (
          // 이름 칸이 7rem 보다 좁아지면 버튼이 다음 줄 오른쪽으로 내려간다 — 이름이 한두 글자씩 쪼개지지 않게 (휴대폰의 관리자 줄 · 320px)
          <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
            <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand-700">{kind}</span>
            <span className="min-w-0 flex-[1_1_7rem] text-sm leading-snug text-ink [overflow-wrap:anywhere]">
              {f.file_name}
              {f.file_size != null && <span className="ml-1.5 whitespace-nowrap text-xs tabular-nums text-mist">{formatBytes(f.file_size)}</span>}
            </span>
            <span className="ml-auto flex shrink-0 gap-1">
              {isViewableKind(kind) && (
                <a href={`${base}/${f.id}`} target="_blank" rel="noopener" className="btn-secondary !px-3 !py-1.5 text-xs">
                  열기
                </a>
              )}
              <a href={`${base}/${f.id}?download=1`} aria-label={`${f.file_name} 받기`} className="btn-secondary !px-3 !py-1.5 text-xs">
                <Icon name="download" size={14} />
                받기
              </a>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
