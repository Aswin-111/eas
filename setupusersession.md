# User Session Limits — Setup

## What this adds
- Admin can set a **per-user concurrent device login limit** per `comp_code`
  (e.g. "Popular" stores → 4 devices/user, "Choice" stores → 2 devices/user).
- Login is **rejected** (HTTP 409) once a user hits their comp_code's limit,
  along with a list of their currently active sessions so the client can
  prompt "log out one of these devices."
- Users can list and revoke their own sessions.
- Admins can view all active sessions for a comp_code and force-revoke any
  session (e.g. a lost/stolen device).
- Logout **actually invalidates** the JWT immediately (previously any valid
  JWT worked until its 7-day expiry with no way to revoke it).

## New/changed files
| File | Change |
|---|---|
| `models/UserSession.js` | **new** — one doc per active login (comp_code, user_id, jti, device info) |
| `models/CompMast.js` | add `session_limit: { type: Number, default: 1 }` field |
| `utils/sessionManager.js` | **new** — core session logic (create/check/revoke), Mongo source of truth + Redis cache |
| `controllers/auth.controller.js` | `login` now enforces the limit and issues JWTs with a `jti` claim |
| `middleware/auth.js` | now validates the JWT's `jti` against active sessions, not just the signature |
| `controllers/session.controller.js` | **new** — logout, my-sessions, admin session views/revocation, set-limit |
| `routes/index.js` | new routes (below) |

## New routes
```
POST   /logout                        (auth)       revoke the session tied to the current token
GET    /my-sessions                   (auth)       list my active sessions + my comp_code's limit
DELETE /my-sessions/:session_id       (auth)       revoke one of my own sessions

PUT    /admin/session-limit           (adminAuth)  body: { comp_code, session_limit }
GET    /admin/sessions?comp_code=X    (adminAuth)  view all active sessions for a comp_code, grouped by user
DELETE /admin/sessions/:session_id    (adminAuth)  force-revoke any session
```

## Example flow
1. Admin sets Popular's limit:
   `PUT /admin/session-limit` → `{ "comp_code": "1001", "session_limit": 4 }`
2. Admin sets Choice's limit:
   `PUT /admin/session-limit` → `{ "comp_code": "1002", "session_limit": 2 }`
3. A Choice user logs in from a 3rd device while 2 are already active:
   ```json
   409 Conflict
   {
     "message": "Device login limit reached (2). Log out from another device to continue.",
     "limit": 2,
     "active_sessions": [
       { "session_id": "...", "device_label": "Unknown device", "issued_at": "...", "last_active": "..." },
       { "session_id": "...", "device_label": "Unknown device", "issued_at": "...", "last_active": "..." }
     ]
   }
   ```
4. Client lets the user pick one to revoke: `DELETE /my-sessions/:session_id`,
   then retries login — now succeeds.

## Passing a device label (optional but recommended)
The login request body can include `device_label` (e.g. "Samsung A14",
"Windows PC - Cyber Cafe 3") so admin/self session lists are readable instead
of showing raw user-agent strings:
```json
POST /login
{ "user_name": "...", "user_password": "...", "device_label": "Cyber Cafe PC 2" }
```

## Required env
Reuses the same `JWT_SECRET` and Redis connection (`config/redis.js`,
`REDIS_URL`) already set up for the item-sync queue. No new env vars needed
beyond what's already configured. Redis is optional-path only — if Redis is
down, session checks fall back to MongoDB and keep working, just slightly
slower.

## ⚠️ Migration / deploy note — important
Tokens issued **before** this change do not carry a `jti` claim. After
deploying, the updated `auth` middleware will reject those old tokens with
`401 Session not recognized, please log in again`. This is intentional (it's
what makes revocation actually work), but it means:

- **Every currently logged-in user/device will be forced to log in again
  once this ships.** Plan the deploy for a low-traffic window or notify
  users in advance.
- Existing `CompMast` records won't have `session_limit` set until you run
  a one-time backfill (or rely on the built-in fallback default of `1` — but
  that's probably too strict for your popular stores, so backfill first):
  ```js
  // one-time migration script
  await CompMast.updateMany(
    { session_limit: { $exists: false } },
    { $set: { session_limit: 1 } } // then override per comp_code as needed
  );
  ```

## Notes on admin login
Admin logins were left **without** a session limit/tracking in this pass,
since your requirement was about comp_code users (popular/choice stores). If
you also want admin logins tracked/limited, say so and I'll extend the same
mechanism to `Admin`.