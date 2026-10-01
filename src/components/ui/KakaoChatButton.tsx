import { KakaoMark } from "./BrandMarks";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * 카카오톡 상담 버튼 (2026-10-01 Alan — "카카오톡 상담링크도 줄게 … 랜딩페이지 중간 중간에 버튼을 넣어주면 좋겠어").
 * 카카오톡 채널 1:1 채팅(`site.academy.kakaoChatUrl`)을 새 창으로 연다. 모양은 카카오 가이드대로 노랑(#FEE500) 바탕 + 검정 심벌 + 검정 85% 글자 —
 * 간편 로그인 버튼과 같은 꼴이라 어디로 가는지 한눈에 읽힌다. 문구는 자리마다 바꿔 쓴다 (기본 "카카오톡 상담").
 */
export function KakaoChatButton({ label = "카카오톡 상담", size = "md", className }: { label?: string; size?: "md" | "lg"; className?: string }) {
  return (
    <a
      href={site.academy.kakaoChatUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("btn bg-[#FEE500] text-black/85 shadow-soft hover:bg-[#F2DA00]", size === "lg" && "!px-6 !py-3.5 text-base", className)}
    >
      <KakaoMark size={size === "lg" ? 22 : 20} />
      {label}
      <span className="sr-only">(새 창)</span>
    </a>
  );
}
