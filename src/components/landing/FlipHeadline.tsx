"use client";

import { Fragment, useEffect, useState } from "react";
import { charDelay, emSlice, flipInMs, flipOutMs, FLIP, HEADLINES, layoutHeadline, type FlipLine } from "@/lib/flip-headline";
import { cn } from "@/lib/utils";

const LAID = HEADLINES.map(layoutHeadline);

/** 줄 · 낱말 · 글자를 그린다. `phase` 가 없으면 그냥 글자 (자리 잡기용) */
function Lines({ lines, phase, first }: { lines: FlipLine[]; phase?: "in" | "out"; first?: boolean }) {
  return (
    <>
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((w, wi) => (
            <Fragment key={wi}>
              {wi > 0 && " "}
              {/* 낱말은 한 덩어리 — 글자가 inline-block 이라 그냥 두면 좁은 화면에서 낱말 가운데서 줄이 바뀐다 */}
              <span className="inline-block whitespace-nowrap">
                {w.map((c) =>
                  phase ? (
                    <span
                      key={c.i}
                      className={cn("flip-ch", c.em && "text-gradient-brand")}
                      data-phase={phase}
                      data-em={c.em || undefined}
                      style={{ animationDelay: `${charDelay(c, phase, first)}ms`, ...(c.em ? emSlice(c.emPos, c.emLen) : null) }}
                    >
                      {c.ch}
                    </span>
                  ) : (
                    <span key={c.i} className={cn(c.em && "text-gradient-brand")}>
                      {c.ch}
                    </span>
                  ),
                )}
              </span>
            </Fragment>
          ))}
        </span>
      ))}
    </>
  );
}

/**
 * 랜딩 헤드라인 — 두 문구가 번갈아 **글자마다 뒤집히며** 바뀐다 (2026-09-30 Alan "역전! 즉, 뒤짚어지면서 새로운 글자들도 확 바뀌는 느낌").
 * 규칙·문구·시간은 `src/lib/flip-headline.ts` 한곳.
 *
 * - **자리는 두 문구 중 큰 쪽으로 잡아 둔다** — 같은 칸에 두 문구를 투명하게 겹쳐 두어(`opacity-0`) 높이가 움직이지 않는다.
 *   바뀔 때마다 아래 설명·버튼이 들썩이면 안 된다. 뒤집히는 글자는 **바닥에 맞춘다** — 두 문구 모두 분홍 낱말이 마지막 줄이라
 *   `역전!` · `역전토익` 이 같은 자리에서 바뀐다.
 * - 투명한 두 문구가 **진짜 글**이다 — 화면 낭독기와 검색은 그것을 읽는다. 뒤집히는 글자는 `aria-hidden` (한 글자씩 읽히면 안 된다).
 * - 서버가 그리는 것은 첫 문구다. 자바스크립트가 돌면 번갈아 가고, 창을 안 보고 있으면(`document.hidden`) 쉬었다가 돌아오면 잇는다.
 *   움직임 줄이기면 globals.css 가 움직임을 끄고 문구만 바뀐다.
 */
export function FlipHeadline({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [cycle, setCycle] = useState(0);
  const [tick, setTick] = useState(0);
  const cur = LAID[idx];
  const first = cycle === 0;

  useEffect(() => {
    const ms = phase === "in" ? flipInMs(cur.count, first) + FLIP.hold : flipOutMs(cur.count);
    const t = window.setTimeout(() => {
      if (phase === "in") {
        if (document.hidden) return setTick((n) => n + 1); // 안 보는 동안은 넘기지 않는다
        setPhase("out");
        return;
      }
      setIdx((v) => (v + 1) % LAID.length);
      setCycle((c) => c + 1);
      setPhase("in");
    }, ms);
    return () => window.clearTimeout(t);
  }, [phase, idx, first, cur.count, tick]);

  return (
    <h1 className={cn("grid", className)}>
      {LAID.map((l, k) => (
        <span key={k} className="pointer-events-none col-start-1 row-start-1 select-none self-end opacity-0">
          <Lines lines={l.lines} />
        </span>
      ))}
      <span key={`${idx}-${cycle}`} aria-hidden className="col-start-1 row-start-1 self-end">
        <Lines lines={cur.lines} phase={phase} first={first} />
      </span>
    </h1>
  );
}
