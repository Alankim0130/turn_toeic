import { MyNav } from "@/components/my/MyNav";
import { getStudentAccess, requireUser } from "@/lib/auth";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const [, access] = await Promise.all([requireUser("/my"), getStudentAccess()]);

  return (
    <div className="container-x py-6 sm:py-10">
      {/* PC(lg 이상)에서는 헤더에 전체 메뉴가 보이므로 두 번째 메뉴 줄을 숨긴다.
          관리자로 넘어가는 버튼은 2026-09-17 부터 헤더(햄버거 왼쪽)에 늘 있어서 여기 두지 않는다 */}
      <div className="mb-6 lg:hidden">
        <MyNav access={{ active: access.active, enrollee: access.enrollee }} />
      </div>
      {children}
    </div>
  );
}
