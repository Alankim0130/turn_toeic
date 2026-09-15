import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { MyNav } from "@/components/my/MyNav";
import { isStaff, requireUser } from "@/lib/auth";

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser("/my");
  const staff = isStaff(profile?.role);

  return (
    <div className="container-x py-6 sm:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <MyNav />
        {staff && (
          <Link href="/admin" className="btn-primary shrink-0 self-start sm:self-auto">
            <Icon name="admin" size={20} className="brightness-0 invert" />
            관리자 페이지로 이동
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
