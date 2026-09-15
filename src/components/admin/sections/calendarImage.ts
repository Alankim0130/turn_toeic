import { holidayNamesBetween } from "@/lib/holidays";
import { WEEKDAY_KO, daysInMonth, monthGrid, weekday, ymd } from "./dates";

/**
 * 학원에 보낼 수업 일정 이미지. 화면을 캡처하지 않고 캔버스에 달력만 새로 그린다
 * (모바일에서 눌러도 같은 크기·같은 모양으로 저장된다).
 * 표시: 월수금 / 화목금 수업일, 일요일·공휴일 빨간색, 공휴일 이름.
 */

const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const C = {
  brand: "#FF2E88",
  tint: "#FFE4EF",
  ink: "#17121F",
  slate: "#5B5563",
  mist: "#9A95A3",
  line: "#ECE6EC",
  surface: "#FFF8FB",
  white: "#FFFFFF",
  red: "#E03131",
  blue: "#1971C2",
};

const W = 1400;
const PAD = 56;
const HEAD = 150;
const WEEK_H = 54;
const CELL_H = 136;
const FOOT = 56;
const SCALE = 2;

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** 캔버스 글꼴은 미리 불러와야 적용된다. Pretendard 는 글자 범위별로 나뉘어 있어 쓸 글자를 함께 넘긴다 */
async function loadFonts(sample: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  const specs = [font(900, 52), font(800, 28), font(700, 20)];
  try {
    await Promise.race([
      Promise.all(specs.map((f) => document.fonts.load(f, sample))),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // 글꼴을 못 불러오면 시스템 글꼴로 그린다
  }
}

export async function downloadCalendarImage({ year, month, mwf, ttf }: { year: number; month: number; mwf: string[]; ttf: string[] }) {
  const rows = monthGrid(year, month);
  const H = PAD + HEAD + WEEK_H + rows.length * CELL_H + FOOT + PAD - 20;
  const last = ymd(year, month, daysInMonth(year, month));
  const holidays = holidayNamesBetween(ymd(year, month, 1), last);
  const prefix = ymd(year, month, 1).slice(0, 8);
  const mwfSet = new Set(mwf.filter((d) => d.startsWith(prefix)));
  const ttfSet = new Set(ttf.filter((d) => d.startsWith(prefix)));
  const mwfCount = mwfSet.size;
  const ttfCount = ttfSet.size;

  const title = `${year}년 ${month}월 수업 일정`;
  const legend = [
    { color: C.brand, label: `월수금 ${mwfCount}회` },
    { color: C.ink, label: `화목금 ${ttfCount}회` },
  ];
  await loadFonts(`역전토익${title}${legend.map((l) => l.label).join("")}${WEEKDAY_KO.join("")}0123456789${[...holidays.values()].flat().join("")}빨간날일요일공휴일…·`);

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  // 배경
  ctx.fillStyle = C.white;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.brand;
  ctx.fillRect(0, 0, W, 10);

  // 제목
  ctx.fillStyle = C.brand;
  ctx.font = font(800, 26);
  ctx.textAlign = "left";
  ctx.fillText("역전토익", PAD, PAD + 36);
  ctx.fillStyle = C.ink;
  ctx.font = font(900, 52);
  ctx.fillText(title, PAD, PAD + 100);

  // 범례 (오른쪽 정렬)
  ctx.font = font(800, 24);
  let lx = W - PAD;
  for (const item of [...legend].reverse()) {
    const tw = ctx.measureText(item.label).width;
    lx -= tw;
    ctx.fillStyle = C.ink;
    ctx.fillText(item.label, lx, PAD + 96);
    lx -= 34;
    ctx.fillStyle = item.color;
    roundRect(ctx, lx, PAD + 74, 24, 24, 6);
    ctx.fill();
    lx -= 28;
  }

  const gridX = PAD;
  const gridY = PAD + HEAD;
  const cellW = (W - PAD * 2) / 7;

  // 요일 머리
  ctx.fillStyle = C.surface;
  roundRect(ctx, gridX, gridY, W - PAD * 2, WEEK_H, 12);
  ctx.fill();
  ctx.font = font(800, 22);
  ctx.textAlign = "center";
  WEEKDAY_KO.forEach((w, i) => {
    ctx.fillStyle = i === 0 ? C.red : i === 6 ? C.blue : C.slate;
    ctx.fillText(w, gridX + cellW * i + cellW / 2, gridY + 35);
  });

  // 날짜 칸
  const top = gridY + WEEK_H + 8;
  rows.forEach((row, ri) => {
    row.forEach((day, ci) => {
      const x = gridX + cellW * ci;
      const y = top + CELL_H * ri;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, cellW - 1.5, CELL_H - 1.5);
      if (day === null) {
        ctx.fillStyle = C.surface;
        ctx.fillRect(x + 1.5, y + 1.5, cellW - 3, CELL_H - 3);
        return;
      }

      const date = ymd(year, month, day);
      const names = holidays.get(date);
      const wd = weekday(year, month, day);
      const red = wd === 0 || !!names;

      ctx.textAlign = "left";
      ctx.fillStyle = red ? C.red : wd === 6 ? C.blue : C.ink;
      ctx.font = font(800, 28);
      ctx.fillText(String(day), x + 14, y + 38);

      if (names) {
        ctx.fillStyle = C.red;
        ctx.font = font(700, 17);
        ctx.fillText(fitText(ctx, names.join("·"), cellW - 24), x + 14, y + 64);
      }

      const track = mwfSet.has(date) ? { label: "월수금", color: C.brand } : ttfSet.has(date) ? { label: "화목금", color: C.ink } : null;
      if (track) {
        const pw = cellW - 24;
        const ph = 40;
        const px = x + 12;
        const py = y + CELL_H - ph - 12;
        ctx.fillStyle = track.color;
        roundRect(ctx, px, py, pw, ph, 10);
        ctx.fill();
        ctx.fillStyle = C.white;
        ctx.font = font(800, 21);
        ctx.textAlign = "center";
        ctx.fillText(track.label, px + pw / 2, py + 27);
      }
    });
  });

  // 바닥 안내
  ctx.textAlign = "left";
  ctx.fillStyle = C.mist;
  ctx.font = font(700, 18);
  ctx.fillText("빨간 날: 일요일 · 공휴일", PAD, top + rows.length * CELL_H + 38);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("image encode failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `역전토익_${year}년${month}월_수업일정.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
