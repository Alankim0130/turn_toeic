import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { AttendScan } from "./AttendScan";

export const metadata: Metadata = { title: "출석", robots: { index: false, follow: false } };

/**
 * 강의실 앞 출석 QR 포스터가 여는 주소 (2026-09-21 · 2026-09-22 포스터 하나로). 로그인이 안 돼 있으면 로그인 뒤 이 주소로 돌아온다.
 * 아이폰은 홈 화면 앱과 사파리의 로그인이 따로라, 카메라로 찍으면 열리는 사파리에서 처음 한 번 로그인해야 할 수 있다.
 */
export default async function AttendPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = (t ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 40);
  await requireUser(`/attend?t=${token}`);

  return (
    <div className="container-x max-w-2xl py-10">
      <PageHeader icon="location" title="출석" description="강의실 앞 출석 QR 로 입실·퇴실을 찍어요." />
      {token ? (
        <AttendScan token={token} />
      ) : (
        <p className="rounded-xl bg-surface px-4 py-6 text-sm text-slate">QR 주소가 비어 있어요. 강의실 앞 출석 QR 을 휴대폰 기본 카메라로 다시 찍어 주세요.</p>
      )}
    </div>
  );
}
