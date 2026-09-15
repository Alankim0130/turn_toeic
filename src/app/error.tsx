"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <Icon name="warning" size={72} />
      <h1 className="mt-6 text-3xl font-black text-ink">문제가 생겼어요</h1>
      <p className="mt-2 max-w-md text-slate">잠시 후 다시 시도해 주세요. 계속 반복되면 연락하기로 알려 주시면 빠르게 고치겠습니다.</p>
      {error.digest && <p className="mt-2 text-xs text-mist">오류 코드: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          다시 시도
        </button>
        <Link href="/" className="btn-secondary">
          홈으로
        </Link>
      </div>
    </section>
  );
}
