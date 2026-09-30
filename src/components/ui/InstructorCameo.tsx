import Image from "next/image";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

type Instructor = (typeof site.instructors)[number];
type Pose = Instructor["caricatures"][number]["pose"];

/**
 * 설명 구간에 잠깐 등장하는 강사 캐리커처 (site.instructors[].caricatures).
 * 2026-09-30 Alan — 히어로 투샷 말고 강사가 나오는 자리는 전부 캐리커처다 (그전에는 실사 캐주얼 컷).
 * 높이는 className 으로 못박는다 (예: "h-40 lg:h-72") — 너비는 비율대로 따라온다.
 * 온몸 그림이라 아래를 흐릴 필요가 없다 (무릎 위까지만 있던 실사 컷의 fade 는 뺐다).
 */
export function InstructorCameo({
  name,
  pose,
  className,
  sizes = "(min-width: 1024px) 240px, 140px",
}: {
  name: Instructor["name"];
  pose: Pose;
  className?: string;
  sizes?: string;
}) {
  const instructor = site.instructors.find((t) => t.name === name);
  const art = instructor?.caricatures.find((c) => c.pose === pose);
  if (!instructor || !art) return null;

  return (
    <Image
      src={art.src}
      width={art.width}
      height={art.height}
      sizes={sizes}
      alt={`${instructor.part} 담당 ${instructor.name} 강사 캐리커처`}
      className={cn("pointer-events-none w-auto max-w-none select-none", className)}
    />
  );
}
