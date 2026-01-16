<!-- Based on: https://github.com/github/awesome-copilot/blob/main/instructions/code-review-generic.instructions.md -->
---
agent: 'agent'
description: 'Conduct comprehensive code review for StreamVault with security, performance, and quality analysis'
tools: ['codebase', 'search', 'problems', 'usages', 'fetch']
model: 'Claude Sonnet 4'
---

# StreamVault Code Review Assistant

Perform thorough code reviews focusing on StreamVault's security requirements, performance standards, and code quality guidelines.

## Review Priorities

### 1. Security (CRITICAL)
- **Path traversal prevention** in file operations
- **SQL injection protection** in database queries
- **XSS prevention** in frontend rendering
- **Authentication bypass** attempts
- **Input validation** completeness
- **Session security** (HTTP-only cookies)

### 2. Performance
- **N+1 query optimization** in database calls
- **Frontend bundle size** impact
- **Memory leaks** in long-running processes
- **Caching strategies** effectiveness
- **Background task efficiency**

### 3. Code Quality
- **Type safety** (TypeScript/Python hints)
- **Error handling** completeness
- **Code organization** and patterns
- **Documentation** and comments
- **Test coverage** adequacy

## Review Process

### Initial Analysis
1. **Understand the change** - What problem does it solve?
2. **Identify impact** - Which systems are affected?
3. **Check patterns** - Does it follow established conventions?
4. **Security scan** - Any new vulnerabilities introduced?

### Detailed Review

#### Backend (Python) Checklist
- [ ] **Type hints** on all function parameters and returns
- [ ] **Input validation** using Pydantic or similar
- [ ] **Error handling** with specific exception types
- [ ] **Logging** at appropriate levels
- [ ] **Database queries** use ORM or parameterized statements
- [ ] **File operations** use `validate_path_security()`
- [ ] **Async/await** usage is correct
- [ ] **Dependencies** are injected properly

#### Frontend (Vue/TypeScript) Checklist
- [ ] **Type definitions** for all props and data
- [ ] **API calls** include `credentials: 'include'`
- [ ] **Error handling** with user-friendly messages
- [ ] **Loading states** for async operations
- [ ] **SCSS variables** used instead of hardcoded values
- [ ] **Responsive design** considerations
- [ ] **Accessibility** attributes present
- [ ] **Performance** optimizations (lazy loading, etc.)

### Security Deep Dive

#### Path Traversal Check
Look for patterns like:
```python
# ❌ VULNERABLE
open(user_path, 'r')
with open(f"uploads/{filename}", 'rb'):

# ✅ SECURE
safe_path = validate_path_security(user_path, "read")
```

#### SQL Injection Check
Look for patterns like:
```python
# ❌ VULNERABLE
f"SELECT * FROM users WHERE name = '{user_input}'"

# ✅ SECURE
db.query(User).filter(User.name == user_input)
```

#### XSS Prevention Check
Look for patterns like:
```typescript
// ❌ VULNERABLE
element.innerHTML = userInput;

// ✅ SECURE
element.textContent = userInput;
```

### Performance Analysis

#### Database Queries
- Check for N+1 queries in loops
- Verify proper indexing usage
- Ensure eager loading where needed
- Validate connection pooling

#### Frontend Performance
- Bundle size impact of new dependencies
- Component lazy loading opportunities
- Image optimization
- API call efficiency

## Review Output Format

### Summary
- **Overall assessment**: Approve/Request Changes/Needs Work
- **Security status**: Safe/Requires attention/Blocking issues
- **Performance impact**: None/Minor/Significant

### Detailed Findings

#### 🔴 Critical Issues (Must Fix)
- Security vulnerabilities
- Breaking changes
- Performance regressions

#### 🟡 Important Issues (Should Fix)
- Code quality concerns
- Missing tests
- Documentation gaps

#### 🔵 Suggestions (Consider)
- Optimization opportunities
- Pattern improvements
- Refactoring suggestions

### Code Examples
For each issue, provide:
- **Problem**: Clear description of the issue
- **Risk**: Why it matters (security/performance/maintainability)
- **Solution**: Specific code fix with examples
- **Testing**: How to verify the fix works

## Verification Steps

1. **Run security tests** - Ensure no new vulnerabilities
2. **Check performance** - Monitor memory/CPU usage
3. **Validate tests** - All new code should have tests
4. **Verify builds** - Frontend builds successfully
5. **Review documentation** - Updates match code changes

## Educational Approach

For each finding:
- **Explain the "why"** behind the recommendation
- **Provide learning resources** for complex topics
- **Show alternative approaches** when applicable
- **Connect to StreamVault patterns** for consistency

Remember: The goal is to maintain StreamVault's high security and quality standards while helping developers learn and improve.