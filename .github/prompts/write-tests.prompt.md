<!-- Based on: https://github.com/github/awesome-copilot/blob/main/prompts/playwright-generate-test.prompt.md -->
---
agent: 'agent'
description: 'Generate comprehensive tests for StreamVault components using pytest (backend) and Vitest (frontend)'
tools: ['codebase', 'search', 'editFiles', 'runTests', 'testFailure']
model: 'Claude Sonnet 4'
---

# StreamVault Test Generator

Generate comprehensive tests following StreamVault's testing patterns and coverage requirements.

## Testing Framework Standards

### Backend (Python)
- **Framework**: pytest with fixtures
- **Coverage**: All public methods and API endpoints
- **Security**: Path traversal, SQL injection, input validation
- **Integration**: Database operations, external API calls
- **Location**: `tests/` directory

### Frontend (Vue/TypeScript)
- **Framework**: Vitest with Vue Test Utils
- **Coverage**: Component behavior, composables, user interactions
- **Integration**: API calls, routing, state management
- **Location**: `app/frontend/src/` (adjacent to components)

## Required Information

Before generating tests, determine:
1. **Component/module** to test
2. **Test type**: Unit, Integration, or E2E
3. **Critical paths** and edge cases
4. **Dependencies** to mock
5. **Security concerns** to validate

## Test Categories

### Backend Tests
- **API Endpoints**: Request/response validation
- **Services**: Business logic and error handling
- **Security**: Input validation, authentication
- **Database**: CRUD operations, constraints
- **Background Tasks**: Recording, processing

### Frontend Tests
- **Component Rendering**: Props, slots, events
- **User Interactions**: Clicks, form submissions
- **API Integration**: Fetch calls with proper credentials
- **Routing**: Navigation and guards
- **State Management**: Pinia store operations

## Security Test Requirements

All tests MUST include:
- **Path traversal prevention** for file operations
- **SQL injection protection** for database queries  
- **XSS prevention** for user input rendering
- **Authentication checks** for protected endpoints
- **Input sanitization** validation

## Execution Process

1. **Analyze target code** using codebase search
2. **Identify existing test patterns** in the project
3. **Generate test cases** covering:
   - Happy path scenarios
   - Edge cases and error conditions
   - Security vulnerabilities
   - Integration points
4. **Run tests** to verify they work
5. **Fix any failures** and iterate

## Test Structure

### Python Test Example
```python
def test_api_endpoint_security(client, auth_headers):
    """Test endpoint blocks path traversal attempts"""
    # Test implementation
```

### Vue Test Example
```typescript
it('should handle API errors gracefully', async () => {
  // Test implementation with proper mocking
});
```

## Coverage Requirements

- **Critical paths**: 100% coverage
- **Security functions**: 100% coverage  
- **API endpoints**: All status codes tested
- **Error handling**: All exception paths covered
- **Edge cases**: Boundary conditions validated

## Output Deliverables

1. **Complete test file(s)** with proper structure
2. **Mock configurations** for external dependencies
3. **Test execution results** showing passes
4. **Coverage report** highlighting gaps
5. **Documentation** explaining test scenarios

Always ensure tests are maintainable, readable, and follow the project's established testing patterns.