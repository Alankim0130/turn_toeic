# 역전토익 홈페이지

부산 서면 YBM어학원 토익 브랜드 **역전토익**의 수강생 학습관리 사이트.
도메인 규칙과 범위는 [CLAUDE.md](./CLAUDE.md)가 기준이다.

## 스택

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- Supabase (Auth · Postgres · Storage · RLS · pg_cron)
- 배포: Vercel

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (Supabase 대시보드 참고)
npm run dev
```

## 데이터베이스

- 마이그레이션: `supabase/migrations/*.sql`
- 원격 적용: `npx supabase db push --linked -p "$SUPABASE_DB_PASSWORD"`
- 타입 재생성: `npx supabase gen types typescript --linked --schema public > src/lib/supabase/database.types.ts`
- 보안·성능 점검: `npx supabase db advisors --linked`

## 디자인 자산

- `public/brand/` 로고·심볼, `public/icons/` 아이콘, `public/illustrations/` 일러스트 — 전부 Higgsfield 로 제작.
- 기본 이모지는 사용하지 않는다. 아이콘은 `<Icon name="…" />` 로만 쓴다.
- 브랜드 컬러: 핫핑크 `#FF2E88` (globals.css 의 `@theme` 참고)

## 주요 경로

| 경로 | 설명 |
|---|---|
| `/` | 역전토익 소개 (랜딩) |
| `/study`, `/contact` | 스터디 신청, 연락하기 (비회원 가능) |
| `/login`, `/signup` | 인증 |
| `/my/*` | 수강생 포털 (등업신청·시간표·불라방·교재신청·다시보기) |
| `/admin/*` | 관리자 (대시보드·학생명단·반 편성·등업 로그·교재주문·분석·스터디·문의) |
