/** 공지 화면에서 돌아갈 수업자료실 주소 — 보던 레벨 · 칸 · 달을 그대로 (다른 곳으로 튀지 않게 이 화면만 받는다) */
export function backTo(sp: { level?: string; cell?: string; term?: string }) {
  const q = new URLSearchParams();
  if (sp.level && /^\d{2,3}$/.test(sp.level)) q.set("level", sp.level);
  if (sp.cell && /^(rc|lc)-[AB]$/.test(sp.cell)) q.set("cell", sp.cell);
  if (sp.term && /^\d{4}-\d{2}$/.test(sp.term)) q.set("term", sp.term);
  const s = q.toString();
  return `/admin/class-materials${s ? `?${s}` : ""}`;
}
