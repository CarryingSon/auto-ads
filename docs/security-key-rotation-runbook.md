# Security Key Rotation Runbook

## Scope
- Session and encryption keys: `SESSION_SECRET`, `TOKEN_ENC_KEY`, `CRON_SECRET`
- Third-party secrets: `META_APP_SECRET`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`
- Infrastructure credentials: database URL/passwords, service-account keys

## Rotation Steps
1. Generate new secrets and store them in your secrets manager.
2. Update production environment variables (Vercel + any worker/runtime environments).
3. Rotate third-party secrets in each provider dashboard (Meta, Google, OpenAI).
4. Roll out application deploy with updated environment values.
5. Invalidate existing sessions by deleting `session` table rows (or cycling session secret only).
6. Validate OAuth reconnect flow and ad launch worker trigger (`/api/workers/launch`) with new `CRON_SECRET`.
7. Confirm logs do not contain sensitive material after deploy.

## Session Invalidation
- Immediate invalidation:
  ```sql
  DELETE FROM session;
  ```
- Secret-only invalidation:
  - Rotating `SESSION_SECRET` invalidates all existing cookies.

## Post-Rotation Verification
- Login + logout works.
- Meta reconnect works and can fetch ad accounts/pages.
- Google Drive connection test passes.
- Upload + queue + worker flow completes.
- `GET /api/meta/pages` and `GET /api/sidebar-data` do not expose `access_token`.

## Rollback
- Keep previous secrets available for emergency rollback window.
- If rollback is required, redeploy with previous environment values and repeat verification.
