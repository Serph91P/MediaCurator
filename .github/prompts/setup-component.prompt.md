<!-- Based on: https://github.com/github/awesome-copilot/blob/main/prompts/create-implementation-plan.prompt.md -->
---
agent: 'agent'
description: 'Create a new Vue component or Python service for StreamVault with proper structure and patterns'
tools: ['codebase', 'search', 'editFiles', 'usages']
model: 'Claude Sonnet 4'
---

# StreamVault Component Creator

Generate new Vue 3 components or Python services following StreamVault's established patterns and architecture.

## Prerequisites

Before creating any component, you must:
1. **Analyze existing patterns** - Search the codebase for similar components
2. **Review project structure** - Understand the current architecture
3. **Follow naming conventions** - Use established file and class naming
4. **Match coding style** - Follow existing TypeScript/Python patterns

## Component Types

Ask the user which type they want to create:

### Frontend Components (Vue 3 + TypeScript)
- **Page Components**: Full-page views (in `app/frontend/src/views/`)
- **UI Components**: Reusable components (in `app/frontend/src/components/`)
- **Composables**: Reusable logic (in `app/frontend/src/composables/`)

### Backend Services (Python + FastAPI)
- **API Routes**: REST endpoints (in `app/routes/`)
- **Services**: Business logic (in `app/services/`)
- **Database Models**: SQLAlchemy models (add to `app/models.py`)

## Required Information

Gather this information before proceeding:
1. **Component name** and purpose
2. **Location** in the project structure
3. **Dependencies** on existing components/services
4. **Props/Parameters** required
5. **Integration points** with existing code

## Implementation Standards

### Vue Components
- Use `<script setup lang="ts">` syntax
- Include proper TypeScript types
- Follow SCSS design system patterns
- Add proper error handling
- Include `credentials: 'include'` for API calls

### Python Services
- Include type hints for all parameters
- Use dependency injection patterns
- Add proper error handling and logging
- Include docstrings with examples
- Follow security best practices

## Execution Steps

1. **Search existing patterns** using codebase tool
2. **Identify integration points** using usages tool
3. **Create component** following established patterns
4. **Update related files** (routes, imports, etc.)
5. **Suggest testing approach** for the new component

## Output Format

Provide:
- Complete component code
- Integration instructions
- Testing recommendations
- Documentation updates needed

Always explain the architectural decisions made and how the component fits into StreamVault's existing patterns.