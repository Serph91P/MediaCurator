---
# Custom Agent Directory Metadata
# This file is recognized by GitHub Copilot as an agent profile directory
# 
# Documentation: https://docs.github.com/en/copilot/using-github-copilot/creating-custom-agents
repository: StreamVault
agent_count: 8
last_updated: 2025-11-13
---

# StreamVault Custom Agents

This directory contains specialized GitHub Copilot custom agents for different development tasks in StreamVault.

## 🤖 Available Agents

### 1. **Bug Fixer** (`bug-fixer.md`)
**For:** UI bugs, regressions, broken functionality

**Specialization:**
- Systematic bug analysis and root cause detection
- Design System pattern reuse
- Session authentication debugging
- Event handler reconnection
- Frontend + Backend bug patterns

**Use Cases:**
- Issue #372: Fix 6 UI Bugs from Testing
- Broken buttons/event handlers
- 401 errors (session cookies)
- Design system regressions
- Duplicate elements (v-for keys)

**Tools:** `read`, `edit`, `search`, `shell`

---

### 2. **Feature Builder** (`feature-builder.md`)
**For:** New backend/frontend features, full-stack implementation

**Specialization:**
- Complete feature implementation (Database → API → UI)
- Migration creation (upgrade + downgrade)
- Service layer with business logic
- API endpoints with error handling
- Frontend composables + components

**Use Cases:**
- Issue #373: Multi-Proxy System with Health Checks
- Issue #374: H.265/AV1 Codec Support
- Any new feature requiring database, API, and UI

**Tools:** `read`, `edit`, `search`, `shell`

**Critical Patterns:**
- Duplicate prevention
- Startup cleanup (zombie state detection)
- External service validation
- Security validation
- Constants extraction

---

### 3. **Mobile Specialist** (`mobile-specialist.md`)
**For:** Mobile responsiveness, PWA, touch optimization

**Specialization:**
- Mobile-first responsive design
- Table → Card transformations (< 768px)
- Touch target optimization (44x44px)
- iOS Safari compatibility
- PWA features

**Use Cases:**
- Settings Tables Mobile Responsive
- Touch target fixes
- iOS zoom prevention
- Responsive grid layouts

**Tools:** `read`, `edit`, `search`

**Breakpoints:**
- `xs: 375px` - iPhone SE
- `md: 768px` - **CRITICAL** (mobile/tablet cutoff)
- `lg: 1024px` - Desktop

---

### 4. **Refactor Specialist** (`refactor-specialist.md`)
**For:** Code quality, optimization, tech debt reduction

**Specialization:**
- Eliminate code duplication
- Extract magic numbers to constants
- Optimize N+1 database queries
- Fix bare except blocks
- Replace unbounded dicts with TTLCache

**Use Cases:**
- Extract constants from codebase
- Fix exception handling
- Optimize slow queries
- Reduce memory leaks

**Tools:** `read`, `edit`, `search`, `shell`

---

### 5. **Database Expert** (`database-expert.md`)
**For:** Migrations, schema design, query optimization

**Specialization:**
- Safe, reversible migrations
- Database schema design
- Query optimization (N+1 fixes)
- Index strategy
- Foreign key constraints

**Use Cases:**
- Create new migrations
- Add indexes for performance
- Fix N+1 query problems
- Change column types
- Add foreign keys with CASCADE

**Tools:** `read`, `edit`, `search`, `shell`

**Critical Rules:**
- ALWAYS implement `downgrade()`
- Test rollback before committing
- Set defaults for existing data
- Use timezone-aware timestamps

---

### 6. **Security Auditor** (`security-auditor.md`)
**For:** Security audits, vulnerability fixes, security best practices

**Specialization:**
- Path traversal prevention
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- Authentication/authorization

**Use Cases:**
- Security audits
- Fix path traversal vulnerabilities
- Add input validation
- Review authentication logic

**Tools:** `read`, `search`, `edit`

**OWASP Top 10:**
- Injection attacks
- Broken authentication
- Sensitive data exposure
- XSS, SQL injection, Command injection
- Insecure file operations

---

### 7. **Test Specialist** (`test-specialist.md`)
**For:** Writing tests, improving coverage, quality assurance

**Specialization:**
- Comprehensive unit tests
- API integration tests
- Edge case testing
- Mocking external services
- High test coverage (80%+)

**Use Cases:**
- Write tests for new features
- Improve test coverage
- Add integration tests
- Test edge cases and errors

**Tools:** `read`, `edit`, `search`, `shell`

**Coverage Goals:**
- Overall: 80%+
- Services: 90%+
- API: 85%+
- Utils: 95%+

---

### 8. **Documentation Writer** (`docs-writer.md`)
**For:** Documentation, code comments, technical guides

**Specialization:**
- Comprehensive README files
- API documentation
- Code docstrings
- Architecture diagrams
- User guides

**Use Cases:**
- Document new features
- Write API documentation
- Add code comments
- Create architecture docs
- Write troubleshooting guides

**Tools:** `read`, `search`, `edit`

---

## 🎯 Agent Selection Guide

| Issue Type | Recommended Agent | Why? |
|------------|------------------|-------|
| **UI Bugs, Broken Buttons** | Bug Fixer | Event handlers, Design System |
| **Regressions after Design Changes** | Bug Fixer | Pattern recognition, CSS fixes |
| **401 Errors, Session Issues** | Bug Fixer | Auth debugging expert |
| **New Backend Features** | Feature Builder | Full-stack workflow |
| **Database Migrations** | Feature Builder or Database Expert | Schema + models + API |
| **Multi-Step Features** | Feature Builder | End-to-end implementation |
| **Mobile Layout Issues** | Mobile Specialist | Responsive breakpoints |
| **Touch Target Problems** | Mobile Specialist | 44px minimum expert |
| **Table → Card Transform** | Mobile Specialist | Mobile patterns |
| **iOS Safari Issues** | Mobile Specialist | Safari quirks knowledge |
| **Code Quality** | Refactor Specialist | Duplication, constants, optimization |
| **N+1 Query Problems** | Refactor Specialist or Database Expert | Query optimization |
| **Memory Leaks** | Refactor Specialist | TTLCache expert |
| **Schema Changes** | Database Expert | Migrations specialist |
| **Query Performance** | Database Expert | Index strategy |
| **Security Vulnerabilities** | Security Auditor | OWASP Top 10 |
| **Path Traversal** | Security Auditor | Input validation |
| **New Feature Tests** | Test Specialist | Comprehensive testing |
| **Coverage Improvement** | Test Specialist | Systematic testing |
| **API Documentation** | Documentation Writer | Clear examples |
| **Architecture Docs** | Documentation Writer | Diagrams + explanations |

---

## 🚀 Usage

### In GitHub Issues

1. Open issue (e.g., #372 "Fix 6 UI Bugs")
2. Click "Assign to Copilot" dropdown
3. Select appropriate agent:
   - Bug Fixer for UI bugs
   - Feature Builder for new features
   - Mobile Specialist for responsive issues
4. Agent reads:
   - `.github/copilot-instructions.md`
   - Relevant path-specific instructions
   - Issue description with Copilot instructions
5. Agent implements systematically following patterns

### In VS Code

Agents can also be used as VS Code chat modes:
1. Open Command Palette (Ctrl+Shift+P)
2. Select chat mode dropdown
3. Choose custom agent
4. Chat with specialized context

---

## 📋 What Agents Automatically Do

All agents follow these patterns:

**1. Read Project Docs:**
- `.github/copilot-instructions.md` (conventions)
- `docs/DESIGN_SYSTEM.md` (frontend)
- `docs/ARCHITECTURE.md` (backend)
- Path-specific instructions (`.github/instructions/*.md`)

**2. Follow Patterns:**
- Design System classes (no custom CSS!)
- Security validation (path + input)
- Constants instead of magic numbers
- Conventional Commits

**3. Testing:**
- Build frontend (`npm run build`)
- Run backend tests (`pytest`)
- Manual browser testing
- Mobile device testing (Mobile Specialist)

**4. Commit Messages:**
- Conventional Commits format
- `fix:` for Bug Fixer
- `feat:` for Feature Builder
- `refactor:` for Refactor Specialist
- `test:` for Test Specialist
- `docs:` for Documentation Writer
- `security:` for Security Auditor

---

## 🔧 Agent Configuration

Each agent has:
- **Name:** Unique identifier
- **Description:** What it specializes in
- **Tools:** Available tools (read, edit, search, shell)
- **Instructions:** Detailed patterns and best practices

Agents know:
- ✅ All Design System patterns
- ✅ Security requirements
- ✅ Architecture patterns
- ✅ Mobile-first guidelines
- ✅ Testing requirements
- ✅ Commit conventions

---

## 📚 Related Documentation

- **Master Task List:** `docs/MASTER_TASK_LIST.md`
- **Copilot Instructions:** `.github/copilot-instructions.md`
- **Path Instructions:** `.github/instructions/*.instructions.md`
- **Design System:** `docs/DESIGN_SYSTEM.md`
- **Architecture:** `docs/ARCHITECTURE.md`

---

## 🎓 Best Practices

**1. Choose Right Agent:**
- UI bug? → Bug Fixer
- New feature? → Feature Builder
- Mobile issue? → Mobile Specialist

**2. Provide Context in Issues:**
- Clear problem description
- Expected behavior
- Steps to reproduce
- Affected files

**3. Review Agent Work:**
- Check commits follow conventions
- Verify tests pass
- Test in browser (especially mobile)

**4. Iterate if Needed:**
- Provide feedback in issue comments
- Agent can refine based on feedback

---

## 💡 Tips

**For Bug Fixes:**
- Assign to **Bug Fixer**
- Include error messages/screenshots
- Mention what changed recently

**For New Features:**
- Assign to **Feature Builder**
- Include detailed requirements
- Specify database, API, and UI needs

**For Mobile Issues:**
- Assign to **Mobile Specialist**
- Test on real devices
- Mention target screen sizes

**For Code Quality:**
- Assign to **Refactor Specialist**
- Point out specific code smells
- Request coverage report

**For Security:**
- Assign to **Security Auditor**
- Describe vulnerability or risk
- Request security checklist

---

Created: 2025-11-13  
Last Updated: 2025-11-13  
Version: 1.0

For questions or suggestions, see [CONTRIBUTING.md](../../CONTRIBUTING.md)
