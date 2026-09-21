import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth";
import { AttendScan } from "./AttendScan";

export const metadata: Metadata = { title: "출석", robots: { index: false, follow: false } };

/**
 * 강의실 화면의 QR 이 여는 주소 (2026-09-21). 로그인이 안 돼 있으면 로그인 뒤 이 주소로 돌아온다 —
 * 토큰은 2분 동안 받으므로 로그인하는 사이 QR 이 바뀌어도 된다. 아이폰은 홈 화면 앱과 사파리의 로그인이 따로라
 * 카메라로 찍으면 사파리에서 한 번 로그인해야 할 수 있다 — 그래서 앱 안 `/my/attendance` 에 코드 입력도 둔다.
 */
export default async function AttendPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = (t ?? "").replace(/[^0-9A-Za-z]/g, "").slice(0, 40);
  await requireUser(`/attend?t=${token}`);

  return (
    <div className="container-x max-w-2xl py-10">
      <PageHeader icon="success" title="출석" description="강의실 QR 로 입실·퇴실을 찍어요." />
      {token ? (
        <AttendScan token={token} />
      ) : (
        <p className="rounded-xl bg-surface px-4 py-6 text-sm text-slate">QR 주소가 비어 있어요. 강의실 화면의 QR 을 다시 찍거나, 마이페이지의 출석에서 6자리 코드를 입력해 주세요.</p>
      )}
    </div>
  );
}
