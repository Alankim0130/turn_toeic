import { cn } from "@/lib/utils";

/** 가로 스크롤 가능한 표 래퍼. 모바일에서도 표가 페이지를 넘치지 않게 한다 */
export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={cn("whitespace-nowrap bg-brand-50/60 px-4 py-3 text-xs font-black text-slate", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top text-ink", className)}>{children}</td>;
}
