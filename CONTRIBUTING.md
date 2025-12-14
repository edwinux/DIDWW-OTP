# Contributing to DIDWW Voice OTP Gateway

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/DIDWW-OTP.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Install dependencies: `npm install`

## Development Setup

### Prerequisites

- Node.js 20+
- Docker (for testing the full stack)
- A DIDWW account with SIP trunk credentials (for end-to-end testing)

### Running Locally

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run with Docker Compose
docker compose up --build
```

### Code Quality

Before submitting a PR, ensure your code passes all checks:

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript type checking
npm run format      # Prettier formatting
```

## Pull Request Process

1. **Create a focused PR** - Each PR should address a single concern
2. **Write clear commit messages** - Describe what and why, not how
3. **Update documentation** - If your change affects usage, update the README
4. **Test your changes** - Verify the Docker build works and API responds correctly

### PR Title Format

Use conventional commit format:
- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `refactor: improve code structure`
- `chore: update dependencies`

## Reporting Issues

When reporting issues, please include:

1. **Description** - Clear description of the problem
2. **Steps to reproduce** - How to trigger the issue
3. **Expected behavior** - What should happen
4. **Actual behavior** - What actually happens
5. **Environment** - OS, Docker version, Node version

## Code Style

- Use TypeScript for all new code
- Follow existing patterns in the codebase
- Keep functions small and focused
- Add JSDoc comments for public APIs

## Questions?

Open an issue with the `question` label if you need help or clarification.
