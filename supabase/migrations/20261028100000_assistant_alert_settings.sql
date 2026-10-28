-- 조교 알림 설정 (2026-10-28 Alan — "조교 알림시스템 설정은 어디서하는거야? 여기 알림설정 페이지를 접근할 수 있게 하면 쉽지 않을까?
-- 다만 '등업신청'과 '불라방 교재주문' 이 두가지만 설정할 수 있도록 하고 나머지는 작동안되게 해놓으면 좋겠어").
--
-- 이 배포부터 조교도 알림 설정 화면(/admin/notifications)에서 등업신청 접수 · 불라방 교재주문을 켜고 끄고, 켠 조교에게만 그 알림이 간다
-- (앱 src/lib/push.ts 의 CREW_ALERT_KINDS — 그전에는 교재주문 하나였다).
--
-- 그전 하루(2026-10-27 ~ 10-28) 조교 행은 교재주문 화면의 '새 교재주문 알림' 카드만 만들었다 — textbook_order 칸만 적었고 나머지 칸은
-- 표의 기본값(true)으로 들어갔다. 그대로 두면 그 조교에게 고르지도 않은 등업신청 알림이 이 배포부터 간다 → 조교 행의 verification 을 끈다.
-- 조교가 화면에서 켜면 다시 켜진다. 교재주문 칸(조교가 고른 값)은 건드리지 않는다.
--
-- 권한은 그대로다 — 조회는 정책 "notification_settings: 본인 조회"(로그인한 누구나 자기 행), 쓰기는 서버 액션(서비스 롤 · 맨 위 requireCrew)뿐이라
-- 새 정책이 필요 없다. 다시 돌려도 같다 (이미 꺼진 행은 건드리지 않는다).

update public.notification_settings s
   set verification = false
  from public.profiles p
 where p.id = s.user_id
   and p.role = 'assistant'
   and s.verification;
