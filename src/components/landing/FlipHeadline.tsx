"use client";

import { Fragment, useEffect, useState } from "react";
import { charDelay, emSlice, flipInMs, flipOutMs, FLIP, HEADLINES, layoutHeadline, scatter, type FlipLine } from "@/lib/flip-headline";
import { cn } from "@/lib/utils";

const LAID = HEADLINES.map(layoutHeadline);

/** 줄 · 낱말 · 글자를 그린다. `phase` 가 없으면 그냥 글자 (자리 잡기용) */
function Lines({ lines, phase, seed = 0, first }: { lines: FlipLine[]; phase?: "in" | "out"; seed?: number; first?: boolean }) {
  return (
    <>
      {lines.map((words, li) => (
        <span key={li} className="block">
          {words.map((w, wi) => (
            <Fragment key={wi}>
              {wi > 0 && " "}
              {/* 휴대폰에서만 바꾸는 줄 (flip-headline.ts 의 `phoneBreak`) — sm 부터는 빈칸 하나로 잇는다. 줄 끝의 빈칸은 브라우저가 지운다 */}
              {w[0].phoneBreak && <br className="sm:hidden" />}
              {/* 낱말은 한 덩어리 — 글자가 inline-block 이라 그냥 두면 좁은 화면에서 낱말 가운데서 줄이 바뀐다 */}
              <span className="inline-block whitespace-nowrap">
                {w.map((c) => {
                  if (!phase) {
                    return (
                      <span key={c.i} className={cn(c.em && "text-gradient-brand")}>
                        {c.ch}
                      </span>
                    );
                  }
                  const s = scatter(c.i, phase, seed);
                  return (
                    <span
                      key={c.i}
                      className={cn("fly-ch", c.em && "text-gradient-brand")}
                      data-phase={phase}
                      data-em={c.em || undefined}
                      style={
                        {
                          "--x": `${s.x}em`,
                          "--y": `${s.y}em`,
                          "--r": `${s.r}deg`,
                          animationDelay: `${charDelay(c, phase, seed, first)}ms`,
                          ...(c.em ? emSlice(c.emPos, c.emLen) : null),
                        } as React.CSSProperties
                      }
                    >
                      {c.ch}
                    </span>
                  );
                })}
              </span>
            </Fragment>
          ))}
        </span>
      ))}
    </>
  );
}

/**
 * 랜딩 헤드라인 — 두 문구가 번갈아, **옛 글자는 사방으로 튕겨 나가고 새 글자는 사방에서 날아와 뒤집히며 선다**
 * (2026-09-30 Alan "사방에서 글자가 날라오는 듯한 느낌 … 확실히 뭔가가 바뀐다는 느낌"). 규칙·문구·시간은 `src/lib/flip-headline.ts` 한곳.
 *
 * - **자리는 두 문구 중 큰 쪽으로 잡아 둔다** — 같은 칸에 두 문구를 투명하게 겹쳐 두어(`opacity-0`) 높이가 움직이지 않는다.
 *   바뀔 때마다 아래 설명·버튼이 들썩이면 안 된다. 날아다니는 글자는 **바닥에 맞춘다** — 두 문구 모두 분홍 낱말이 마지막 줄이다.
 * - 바뀔 때는 **두 겹이 잠깐 함께 선다** — 떠나는 문구(`out`)가 튕겨 나가는 동안 새 문구(`in`)가 날아든다. 떠나는 겹은 다 날아가면 치운다.
 * - 투명한 두 문구가 **진짜 글**이다 — 화면 낭독기와 검색은 그것을 읽는다. 날아다니는 글자는 `aria-hidden` (한 글자씩 읽히면 안 된다).
 * - 서버가 그리는 것은 첫 문구다. 창을 안 보고 있으면(`document.hidden`) 넘기지 않고, 움직임 줄이기면 globals.css 가 움직임을 끄고 문구만 바꾼다.
 */
export function FlipHeadline({ className }: { className?: string }) {
  const [idx, setIdx] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [cycle, setCycle] = useState(0);
  const [tick, setTick] = useState(0);
  const first = cycle === 0;

  // 다 선 뒤 서 있다가 다음 문구로
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (document.hidden) return setTick((n) => n + 1); // 안 보는 동안은 넘기지 않는다
      setLeaving(idx);
      setIdx((v) => (v + 1) % LAID.length);
      setCycle((c) => c + 1);
    }, flipInMs(first) + FLIP.hold);
    return () => window.clearTimeout(t);
  }, [idx, first, tick]);

  // 떠나는 겹은 다 날아가면 치운다
  useEffect(() => {
    if (leaving == null) return;
    const t = window.setTimeout(() => setLeaving(null), flipOutMs() + 60);
    return () => window.clearTimeout(t);
  }, [leaving, cycle]);

  return (
    <h1 className={cn("grid", className)}>
      {LAID.map((l, k) => (
        <span key={k} className="pointer-events-none col-start-1 row-start-1 select-none self-end opacity-0">
          <Lines lines={l.lines} />
        </span>
      ))}
      {leaving != null && (
        <span key={`out-${cycle}`} aria-hidden className="pointer-events-none col-start-1 row-start-1 self-end">
          <Lines lines={LAID[leaving].lines} phase="out" seed={cycle} />
        </span>
      )}
      <span key={`in-${cycle}`} aria-hidden className="col-start-1 row-start-1 self-end">
        <Lines lines={LAID[idx].lines} phase="in" seed={cycle} first={first} />
      </span>
    </h1>
  );
}
