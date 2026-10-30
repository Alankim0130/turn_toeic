-- Apple 로 로그인 — 탈퇴할 때 애플 연결을 끊으려고 받아 두는 refresh token (2026-10-30 아이폰 앱 · App Store 심사 5.1.1(v)).
-- src/lib/apple-auth.ts 가 로그인 직후 authorization code 를 바꿔 여기에 두고, 회원 탈퇴(src/lib/account-deletion.ts)가 읽어 애플에 끊기를 요청한다.
-- **서버(service_role)만 읽고 쓴다** — 로그인한 사람도 자기 토큰을 읽지 못한다 (애플 계정에 닿는 값이다).
-- client_id 는 받은 곳 — 웹(Services ID) · 앱(번들 ID). 끊을 때 같은 client_id 여야 한다.

create table public.apple_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 200),
  refresh_token text not null check (char_length(refresh_token) between 1 and 4000),
  updated_at timestamptz not null default now()
);

alter table public.apple_tokens enable row level security;

-- 서버만. service_role 은 RLS 를 비껴가지만 뜻을 적어 둔다 — 로그인한 사람 · 비회원에게는 정책이 없어 한 줄도 안 보인다
create policy "apple_tokens: 서버만" on public.apple_tokens for all to service_role using (true) with check (true);

revoke all on public.apple_tokens from anon, authenticated;
grant select, insert, update, delete on public.apple_tokens to service_role;
