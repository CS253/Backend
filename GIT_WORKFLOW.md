# Travelly Backend - Git Workflow

This document outlines the workflow for our team to ensure code stability and efficient collaboration.

---

## 1. Branch Structure

- **`main`**: Demo-ready, stable code only.
- **`develop`**: Integration branch for ongoing development.
- **`feature/*`**: New features (e.g., `feature/auth`).
- **`fix/*`**: Bug fixes (e.g., `fix/login-error`).
- **`setup/*`**: Initial infrastructure or configuration work.

---

## 2. General Workflow

### Starting a New Feature
Always branch out from `develop`:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### During Development
Commit regularly with meaningful messages:
```bash
git add .
git commit -m "feat: add user login logic"
git push -u origin feature/your-feature-name
```

### Finalizing a Feature
1. Open a **Pull Request (PR)** on GitHub: `feature/your-feature-name` → `develop`.
2. Get the code reviewed.
3. Once merged, delete the feature branch.

### Bug Fixes
Branch out from `develop`, fix the bug, and open a PR back to `develop`:
```bash
git checkout develop
git pull
git checkout -b fix/bug-description
```

---

## 3. Deployment to Main
Only merge `develop` into `main` when the MVP is complete or a major stable milestone is reached.
```
develop → main
```

---

## 4. Team Rules
- **DO NOT** push directly to `main`.
- **DO NOT** work directly on `develop`.
- **ALWAYS** pull the latest changes before starting work.
- Keep commits small and specific.
