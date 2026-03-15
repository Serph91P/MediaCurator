# Copilot Instructions for MediaCurator

## Commit Message Convention

This project uses **Conventional Commits** for automatic versioning and changelog generation.
Every commit message MUST follow this format:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Purpose | Version Impact |
|------|---------|----------------|
| `feat` | New feature or capability | **Minor** bump (0.X.0) |
| `fix` | Bug fix | **Patch** bump (0.0.X) |
| `docs` | Documentation only | Patch bump |
| `style` | Formatting, whitespace, no code change | Patch bump |
| `refactor` | Code restructuring, no behavior change | Patch bump |
| `perf` | Performance improvement | Patch bump |
| `test` | Adding or updating tests | Patch bump |
| `chore` | Build, tooling, dependencies | Patch bump |
| `ci` | CI/CD pipeline changes | Patch bump |

### Breaking Changes → Major Bump

A breaking change triggers a **Major** version bump (X.0.0). Mark it with either:

- An `!` after the type/scope: `feat!: remove legacy API`
- A `BREAKING CHANGE:` footer in the commit body:
  ```
  refactor(api): change auth endpoints

  BREAKING CHANGE: /auth/login now requires JSON body instead of form data
  ```

### Scopes

Use scopes to indicate the affected area. Common scopes for this project:

- `api` – Backend API routes/endpoints
- `ui` – Frontend components/pages
- `auth` – Authentication/security
- `db` – Database/models/migrations
- `docker` – Docker/deployment
- `sync` – Media sync services (Radarr, Sonarr, Emby)
- `rules` – Cleanup rules engine
- `notifications` – Notification system
- `scheduler` – Background jobs/scheduler

### Examples

```
feat(api): add library statistics endpoint
fix(ui): correct pagination on media list
refactor(sync): simplify Sonarr client error handling
docs: update README with Docker Compose examples
feat!: redesign rule evaluation engine
chore(deps): update FastAPI to 0.115
ci: add ARM64 Docker build
perf(db): add index on media.last_played
```

### Rules

- Type and description are **required**
- Scope is optional but encouraged
- Description must be lowercase, imperative mood ("add" not "added" or "adds")
- No period at the end of the description
- Body and footer are optional
- Use `!` or `BREAKING CHANGE:` only for genuinely incompatible changes

## Language

- Commit messages in **English**
- Code comments in **English**

## Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLAlchemy, SQLite/PostgreSQL
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Deployment**: Docker, GitHub Actions
