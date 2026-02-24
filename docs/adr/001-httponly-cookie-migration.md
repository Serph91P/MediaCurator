# ADR-001: Migrate JWT Storage from localStorage to httpOnly Cookies

**Status:** Proposed  
**Date:** 2025-01-01  
**Decision Makers:** Engineering Team

## Context

The application currently stores JWT access and refresh tokens in the browser's `localStorage`. While functional, this approach exposes tokens to Cross-Site Scripting (XSS) attacks: any injected script can read `localStorage` and exfiltrate tokens.

## Decision Drivers

- **XSS risk**: Any successful XSS attack can steal tokens from `localStorage`.
- **OWASP guidance**: OWASP recommends httpOnly cookies for token storage because JavaScript cannot access them, eliminating the XSS token-theft vector.
- **Defense in depth**: Moving tokens to httpOnly cookies adds a layer of protection even if CSP or input sanitization is bypassed.

## Considered Options

### Option A: Keep localStorage (current)

- **Pros**: Simple; no backend cookie logic needed; works trivially with CORS.
- **Cons**: Tokens readable by any script; XSS = full account takeover.

### Option B: httpOnly Secure Cookies (recommended)

- **Pros**: JavaScript cannot read the token; immune to XSS token theft; `SameSite` attribute adds CSRF mitigation.
- **Cons**: Requires backend changes to set/clear cookies; CORS `credentials: include` needed; CSRF protection must be verified; slightly more complex frontend auth flow.

### Option C: In-memory only (no persistence)

- **Pros**: Tokens never persisted; hard to steal.
- **Cons**: User must re-authenticate on every page refresh; poor UX.

## Decision

**Option B — httpOnly Secure Cookies** is the recommended path forward.

## Implementation Plan

### Backend Changes

1. **Login endpoint** (`POST /api/auth/login`):
   - Set `Set-Cookie` header with `access_token` (httpOnly, Secure, SameSite=Lax, Path=/api).
   - Set `Set-Cookie` header with `refresh_token` (httpOnly, Secure, SameSite=Strict, Path=/api/auth/refresh).
   - Remove tokens from response body (or keep for backward compatibility during migration).

2. **Refresh endpoint** (`POST /api/auth/refresh`):
   - Read refresh token from cookie instead of `X-Refresh-Token` header.
   - Issue new cookies on rotation.

3. **Logout endpoint** (`POST /api/auth/logout`):
   - Clear both cookies by setting `Max-Age=0`.

4. **Auth dependency** (`get_current_user`):
   - Read `access_token` from cookie first; fall back to `Authorization` header for API clients.

5. **CSRF protection**:
   - Verify `SameSite` attribute is sufficient; consider adding a CSRF token for non-GET state-changing requests if needed.

### Frontend Changes

1. Remove `localStorage.setItem/getItem/removeItem` calls for tokens.
2. Add `credentials: 'include'` (or `withCredentials: true` for Axios) to all API requests.
3. Remove `Authorization` header injection from the Axios interceptor.
4. Update WebSocket auth to use a short-lived token from a dedicated endpoint instead of reading from `localStorage`.

### Migration Strategy

1. Deploy backend with dual support (cookie + header) first.
2. Update frontend to use cookies.
3. After confirming stability, remove header-based auth support.

## Consequences

- **Positive**: Tokens are no longer accessible to JavaScript; reduced XSS impact.
- **Negative**: Slightly more complex auth flow; requires careful CORS and cookie configuration; WebSocket auth needs a dedicated token endpoint.
- **Risks**: Incorrect `SameSite`/`Secure`/`Domain` configuration can break auth in development or cross-origin setups. Mitigated by thorough testing.

## References

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Scripting_Prevention_Cheat_Sheet.html)
- [MDN: Using HTTP cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)
