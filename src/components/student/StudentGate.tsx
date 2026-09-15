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
