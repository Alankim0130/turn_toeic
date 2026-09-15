"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Opt = { id: number; label: string; group: string; status: string };
const STATUS: Record<string, string> = { draft: "준비", open: "모집", closed: "종료" };

export function SectionSelect({ options, value }: { options: Opt[]; value: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const groups = new Map<string, Opt[]>();
  for (const o of options) groups.set(o.group, [...(groups.get(o.group) ?? []), o]);

  return (
    <select
      id="section-select"
      className="input"
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => startTransition(() => router.push(`/admin/replays?section=${e.target.value}`))}
    >
      {[...groups.entries()].map(([g, list]) => (
        <optgroup key={g} label={g}>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} · {STATUS[o.status] ?? o.status}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
