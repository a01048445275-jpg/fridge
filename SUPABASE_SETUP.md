# Supabase 설정

3단계의 가입·로그인·프로필·레시피 저장은 Supabase Auth와 PostgreSQL을 사용합니다. 브라우저는 같은 출처의 Vercel API만 호출하며, 서비스 역할 키는 서버에서만 사용합니다.

## 1. 데이터베이스 준비

1. Supabase 프로젝트를 생성합니다.
2. 대시보드의 **SQL Editor**에서 `supabase/schema.sql` 전체를 실행합니다.
3. **Authentication → URL Configuration**에서 앱의 배포 URL을 Site URL로 지정합니다.
4. 비밀번호 복구 이메일을 사용할 수 있도록 Redirect URLs에 앱의 배포 URL을 추가합니다.
5. 개발 중 이메일 확인을 사용하지 않으면 Supabase의 **Authentication → Providers → Email**에서 확인 설정을 조정합니다. 배포 전에 실제 이메일 확인 정책을 검토하세요.

## 2. 서버 환경변수

`.env.local`에 다음 변수를 추가하고 Vercel 프로젝트의 Production·Preview 환경에도 같은 값을 각각 설정합니다.

```dotenv
SUPABASE_URL=https://프로젝트참조.supabase.co
SUPABASE_ANON_KEY=Supabase_anon_키
SUPABASE_SERVICE_ROLE_KEY=Supabase_service_role_키
APP_URL=http://localhost:3000
```

- `SUPABASE_URL`과 공개 anon key는 Supabase 프로젝트 설정의 API 페이지에서 확인합니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 **서버 전용 비밀값**입니다. HTML, 브라우저 JavaScript, Git 또는 공개 환경변수 접두사에 넣지 마세요.
- 로컬에서 `APP_URL`은 Vercel 개발 서버 주소로, 배포에서는 실제 HTTPS 사이트 주소로 설정합니다.
- `.env.local`은 `.gitignore`에 포함되어 있으므로 커밋되지 않습니다.

## 3. 기능 동작

- 가입 시 Supabase의 이메일 확인 설정에 따라 즉시 로그인되거나 이메일 확인 안내가 표시됩니다.
- 비밀번호 복구 이메일은 `APP_URL`로 돌아옵니다. Supabase 이메일 템플릿은 복구 링크를 기본 Auth 링크로 유지해야 합니다.
- 계정 삭제는 현재 비밀번호를 다시 확인하고 Auth 계정을 삭제합니다. DB 외래 키의 `on delete cascade`가 프로필과 저장 레시피를 함께 제거합니다.
- 브라우저는 프로필, 비밀번호, 레시피 데이터를 `localStorage`에 저장하지 않습니다. 재료 단계의 입력 기능만 기존 PRD에 따라 브라우저 저장소를 사용합니다.
