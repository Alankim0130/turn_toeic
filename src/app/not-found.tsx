import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function NotFound() {
  return (
    <section className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <Icon name="warning" size={72} />
      <h1 className="mt-6 text-3xl font-black text-ink">페이지를 찾을 수 없어요</h1>
      <p className="mt-2 text-slate">주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <Link href="/" className="btn-primary mt-8">
        홈으로 돌아가기
      </Link>
    </section>
  );
}
