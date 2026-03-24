# Meta OAuth + Ad Account Access Staging Checklist

## Scope
This checklist validates the new ad-account access filtering flow:
- per-account `promote_pages` verification
- excluded-account diagnostics in selection UI
- fallback redirect to `/connections` when no usable accounts exist
- server-side protection against selecting excluded accounts

## Preflight
1. Deploy latest build to staging.
2. Confirm env keys are present (`META_APP_ID`, `META_APP_SECRET`, `APP_BASE_URL`, DB vars).
3. Ensure at least two Meta test users:
- User A: mixed access (some ad accounts usable, some missing permissions).
- User B: no usable ad accounts.
4. Open browser DevTools (Network + Console).

## Automated Checks Already Executed Locally
1. `npm run test:edge:oauth` -> PASS
2. `npm run check` -> PASS
3. `npm run build` -> PASS
4. Runtime unauth smoke (`PORT=5055 npm run dev` + curl):
- `GET /api/meta/pages` -> `401 Not authenticated`
- `GET /api/meta/pending-ad-accounts` -> `401 Not authenticated`
- `GET /api/sidebar-data` -> `401 Not authenticated`
- `GET /auth/status` -> `200` with disconnected statuses

## Manual Staging Scenarios
Mark each scenario with `PASS`/`FAIL` and keep screenshot + network evidence.

| ID | Scenario | Steps | Expected | Status |
|---|---|---|---|---|
| STG-01 | Mixed-access OAuth reconnect | Reconnect with User A | Redirect to `/select-ad-account`; usable accounts selectable; excluded accounts visible with diagnostic badge | TODO |
| STG-02 | Excluded badge reason mapping | In selection page inspect excluded cards | Badge reason matches API issue (`MISSING PERMISSION`, `NO PROMOTABLE PAGES`, `AUTH ISSUE`, `CHECK FAILED`) | TODO |
| STG-03 | Excluded account not selectable (UI) | Click excluded account card | No selection toggle; card remains disabled | TODO |
| STG-04 | Select-all only includes usable | Click `Select all` | Only selectable accounts are selected; excluded remain unselected | TODO |
| STG-05 | Confirm usable accounts | Confirm selected accounts | Redirect to dashboard; selected account persisted; pending list cleared | TODO |
| STG-06 | Server-side tamper protection | Send POST `/api/meta/confirm-ad-account` with excluded IDs via DevTools/cURL with session+CSRF | API rejects with 400 (`No valid selectable accounts...`) | TODO |
| STG-07 | No usable accounts fallback | Reconnect with User B | Redirect to `/connections?meta=error...`; toast with detailed message; no forced redirect to selection page | TODO |
| STG-08 | Zero accounts from Meta | Use profile that returns 0 ad accounts | Redirect to `/connections` with message `Meta did not return any ad accounts...` | TODO |
| STG-09 | Account switch to no-permission account | Switch account in app to known no-access account | `/api/meta/pages?refresh=true` returns empty + `accessIssue`; stale pages not shown | TODO |
| STG-10 | Cache isolation after reconnect | Reconnect from full-access user to limited user | Old pages/IG accounts are not leaked into new account context | TODO |
| STG-11 | Popup OAuth no-usable path | Trigger popup login with User B | Opener receives oauth-error and redirects to `/connections` correctly | TODO |
| STG-12 | Sessionless security regression | Hit protected endpoints without auth | 401/403 responses as expected (no data leak) | PASS (local smoke) |

## Evidence To Capture Per Scenario
1. URL after action (including query params).
2. API response payloads for:
- `/api/meta/pending-ad-accounts`
- `/api/meta/confirm-ad-account`
- `/api/meta/pages?refresh=true`
3. UI screenshot (selection cards, badges, or connections error state).
4. Relevant server logs (`[MetaOAuth]` lines with blocked-by-issue counts).

## Exit Criteria
1. All scenarios STG-01..STG-12 are `PASS`.
2. No cross-account page leakage observed.
3. No excluded account can be persisted through API tampering.
