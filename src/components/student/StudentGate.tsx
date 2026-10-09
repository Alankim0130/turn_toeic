import { getStudentAccess } from "@/lib/auth";
import { canUseFeature, STUDENT_FEATURES, type StudentFeatureKey } from "@/lib/site";
import { LockedFeature } from "./LockedFeature";

/**
 * 수강생전용 페이지 맨 위에서 호출한다.
 *   const locked = await studentGate("live");
 *   if (locked) return locked;
 * 이용할 수 없으면 잠금 안내를 돌려주고, 이용할 수 있으면 null.
 * 화면 안내용이며 실제 데이터 보호는 RLS 가 한다.
 */
export async function studentGate(key: StudentFeatureKey) {
  const feature = STUDENT_FEATURES.find((f) => f.key === key);
  if (!feature) return null;
  const access = await getStudentAccess();
  if (canUseFeature(feature, access)) return null;
  return <LockedFeature feature={feature} access={access} />;
}

/**
 * 잠금 판정과 화면 데이터를 **동시에** 받는다 (2026-10-09 Alan "화면 전환이 좀 느린데" — 예전에는 잠금 판정이 끝나야 데이터를 물어
 * 서버를 한 번 더 다녀왔다).
 *   const g = await loadGated("live", () => Promise.all([getMyLiveCards(), getMyWeek5()]));
 *   if (g.locked) return g.locked;
 *   const [cards, week5] = g.data;
 * 잠겨 있으면 받은 데이터는 버리고 잠금 안내를 그린다 — 데이터는 RLS 가 이미 막고 있고, 그 조회가 실패해도 잠금 안내가 먼저다.
 */
export async function loadGated<T>(key: StudentFeatureKey, load: () => Promise<T>): Promise<{ locked: React.ReactElement; data?: undefined } | { locked: null; data: T }> {
  const data = load();
  // 먼저 돌아가거나(잠김) 판정이 던져도 '처리되지 않은 실패' 로 남지 않게 — 아래 await 는 실패를 그대로 받는다
  data.catch(() => {});
  const locked = await studentGate(key);
  if (locked) return { locked };
  return { locked: null, data: await data };
}
