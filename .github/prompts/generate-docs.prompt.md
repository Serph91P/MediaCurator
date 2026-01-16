<!-- Based on: https://github.com/github/awesome-copilot/blob/main/prompts/documentation-writer.prompt.md -->
---
agent: 'agent'
description: 'Generate comprehensive documentation for StreamVault using Diátaxis framework principles'
tools: ['codebase', 'search', 'fetch', 'editFiles']
model: 'Claude Sonnet 4'
---

# StreamVault Documentation Generator

Generate high-quality technical documentation for StreamVault following the Diátaxis framework principles and project documentation standards.

## Documentation Philosophy

### Diátaxis Framework
All documentation follows four distinct types:
- **Tutorials**: Learning-oriented, step-by-step guides
- **How-to Guides**: Problem-oriented, specific solutions
- **Reference**: Information-oriented, technical details
- **Explanation**: Understanding-oriented, concepts and context

### StreamVault Standards
- **Accuracy**: All code examples must be tested and current
- **Completeness**: Cover all user scenarios and edge cases
- **Clarity**: Technical accuracy with clear, accessible language
- **Consistency**: Match existing documentation tone and structure

## Documentation Types

### User Documentation
- **Setup Guides**: Installation and configuration
- **User Manual**: Feature usage and workflows
- **Troubleshooting**: Common issues and solutions
- **API Reference**: Complete endpoint documentation

### Developer Documentation
- **Architecture Overview**: System design and patterns
- **Development Setup**: Local development environment
- **Contributing Guide**: Code contribution process
- **API Internal**: Service and component documentation

### Operational Documentation
- **Deployment Guide**: Production deployment steps
- **Configuration Reference**: All environment variables
- **Monitoring Setup**: Logging and metrics configuration
- **Security Guide**: Security best practices

## Content Requirements

### Required Information Gathering
Before writing, determine:
1. **Target audience**: Beginner, intermediate, or expert
2. **Document type**: Tutorial, how-to, reference, or explanation
3. **User goal**: What should they accomplish?
4. **Scope**: What to include and exclude
5. **Context**: How it fits with existing docs

### StreamVault-Specific Elements
- **Version compatibility**: Specify supported versions
- **Security notes**: Highlight security implications
- **Performance impact**: Note performance considerations
- **Browser compatibility**: Frontend feature support
- **Docker considerations**: Container-specific guidance

## Documentation Structure

### Standard Page Template
```markdown
# Page Title

## Overview
Brief description and purpose

## Prerequisites  
- Required knowledge/setup
- System requirements
- Dependencies

## Main Content
- Step-by-step instructions OR
- Detailed reference information OR
- Conceptual explanations

## Examples
Working code examples with explanations

## Troubleshooting
Common issues and solutions

## Related Topics
Links to relevant documentation
```

### Code Example Standards
- **Working examples**: All code must be tested
- **Complete context**: Show imports and setup
- **Error handling**: Include proper error handling
- **Security**: Follow security best practices
- **Comments**: Explain non-obvious code

## Content Guidelines

### Writing Style
- **Active voice**: "Click the button" not "The button should be clicked"
- **Present tense**: "The system processes" not "The system will process"
- **Clear headings**: Descriptive, scannable section headers
- **Consistent terminology**: Use StreamVault's established terms
- **User-focused**: Address the user directly ("you")

### Technical Accuracy
- **Verify all steps**: Test every procedure
- **Current screenshots**: Use up-to-date interface images
- **Accurate paths**: File paths and URLs must be correct
- **Version-specific**: Note version differences where relevant
- **Security validation**: Ensure examples are secure

## Specialized Documentation

### API Documentation
- **Endpoint description**: Purpose and use cases
- **Parameters**: Type, required/optional, validation rules
- **Request examples**: Complete working requests
- **Response examples**: All possible response formats
- **Error codes**: Complete error response documentation
- **Authentication**: Required credentials and headers

### Configuration Reference
- **Environment variables**: Purpose, default values, examples
- **File formats**: Structure and validation rules
- **Security implications**: What each setting affects
- **Performance impact**: How settings affect performance
- **Dependencies**: What other settings are related

### Troubleshooting Guides
- **Symptom description**: Clear problem identification
- **Root cause analysis**: Why the problem occurs
- **Step-by-step solutions**: Detailed resolution steps
- **Prevention**: How to avoid the problem
- **Related issues**: Links to similar problems

## Quality Assurance

### Pre-Publication Checklist
- [ ] **Accuracy**: All instructions tested and verified
- [ ] **Completeness**: All scenarios covered
- [ ] **Clarity**: Technical reviewers confirm readability
- [ ] **Consistency**: Matches existing documentation style
- [ ] **Links**: All internal and external links work
- [ ] **Examples**: All code examples run successfully
- [ ] **Screenshots**: Current and properly annotated

### Maintenance Requirements
- **Version updates**: Update with each release
- **Link checking**: Verify links remain valid
- **User feedback**: Incorporate user suggestions
- **Accuracy validation**: Re-test procedures periodically

## Documentation Workflow

### Research Phase
1. **Analyze existing code** using codebase search
2. **Find related documentation** to maintain consistency
3. **Identify user scenarios** and pain points
4. **Gather technical details** from source code
5. **Test all procedures** before documenting

### Writing Phase
1. **Create outline** based on user needs
2. **Write first draft** focusing on completeness
3. **Add code examples** with proper testing
4. **Include screenshots** where helpful
5. **Add cross-references** to related topics

### Review Phase
1. **Technical accuracy** review by developers
2. **User experience** review by target audience
3. **Editorial review** for clarity and style
4. **Final testing** of all procedures
5. **Integration** with existing documentation

## Output Specifications

### File Organization
- **Location**: Appropriate directory in `docs/`
- **Naming**: Descriptive, kebab-case filenames
- **Format**: Markdown with proper frontmatter
- **Images**: Optimized, descriptive alt text
- **Links**: Use relative paths for internal links

### Metadata Requirements
```markdown
---
title: "Document Title"
description: "Brief description for SEO/search"
date: "YYYY-MM-DD"
author: "Author Name"
tags: ["tag1", "tag2"]
target_audience: "users|developers|operators"
document_type: "tutorial|howto|reference|explanation"
---
```

### Cross-Reference Integration
- **Table of contents**: Update navigation
- **Related links**: Add bidirectional references
- **Search tags**: Include relevant keywords
- **Index entries**: Add to site-wide index

Remember: Great documentation makes StreamVault accessible to users at all skill levels while maintaining technical accuracy and security best practices.