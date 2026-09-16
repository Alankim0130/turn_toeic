import Image from "next/image";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

type Instructor = (typeof site.instructors)[number];
type Pose = Instructor["casual"][number]["pose"];

/**
 * 설명 구간에 잠깐 등장하는 캐주얼 복장 강사 컷 (site.instructors[].casual).
 * 높이는 className 으로 못박는다 (예: "h-40 lg:h-72") — 너비는 비율대로 따라온다.
 * 무릎 위까지만 있는 사진이라 기본으로 아래쪽을 흐린다. 박스 가장자리에 걸쳐 잘리는 자리면 fade={false}.
 */
export function InstructorCameo({
  name,
  pose,
  className,
  sizes = "(min-width: 1024px) 240px, 140px",
  fade = true,
}: {
  name: Instructor["name"];
  pose: Pose;
  className?: string;
  sizes?: string;
  fade?: boolean;
}) {
  const instructor = site.instructors.find((t) => t.name === name);
  const photo = instructor?.casual.find((c) => c.pose === pose);
  if (!instructor || !photo) return null;

  return (
    <Image
      src={photo.src}
      width={photo.width}
      height={photo.height}
      sizes={sizes}
      alt={`${instructor.part} 담당 ${instructor.name} 강사`}
      className={cn(
        "pointer-events-none w-auto max-w-none select-none",
        fade && "[mask-image:linear-gradient(to_bottom,#000_70%,transparent)]",
        className,
      )}
    />
  );
}
