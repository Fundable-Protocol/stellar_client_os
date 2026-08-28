# Code Style Guide

This document outlines the coding style and conventions to be followed when contributing to the Fundable Stellar project. Adhering to these guidelines ensures consistency and readability across the codebase.

## Branches, Commits, and Pull Requests

These conventions apply to every contribution. Keeping the branch name, commit history, and pull request focused makes changes easier to review, test, and release.

### Branch Naming

Create every feature branch from an up-to-date `main` branch. Use one of the following prefixes, followed by the issue number and a short, lowercase, hyphen-separated description:

- **Feature work:** `feature/<issue>-<short-description>`
- **Bug fixes:** `bugfix/<issue>-<short-description>`
- **Maintenance or documentation:** `chore/<issue>-<short-description>`

For example, use `feature/637-sponsor-pdf`, `bugfix/455-sanitize-telemetry`, or `chore/635-contributing-guide`. Do not commit directly to `main`, and do not combine unrelated issues in one branch. Keep branch names stable after opening a pull request so reviewers and automation can follow the change.

### Commit Messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) format:

```text
<type>(<optional-scope>): <imperative summary>
```

Use a concise imperative subject, keep it to roughly 72 characters, and omit the final period. The supported types are `feat` for user-facing functionality, `fix` for bug fixes, `chore` for maintenance, `docs` for documentation, `refactor` for behavior-preserving restructuring, `test` for tests, `build` for build tooling, and `ci` for automation. Add a scope when it clarifies the affected area, such as `feat(api): add stream pagination`.

Use the commit body for context when the reason or trade-off is not clear from the subject. Wrap longer lines for readability. A commit should represent one coherent change and should not include generated files, secrets, or unrelated formatting churn. Reference an issue or breaking change in the footer when appropriate, for example `Closes #637` or `BREAKING CHANGE: ...`.

### Pull Request Requirements

Open one pull request per issue and target `main` in the upstream repository. The pull request title should use the same Conventional Commit style as the primary commit, followed by the issue number when useful, for example `feat(ux): add sponsor forest PDF export (#637)`.

Every pull request description must explain the motivation, name the related issue with `Closes #<issue>` when the change completes it, summarize the implementation, list verification commands and results, and call out any known limitations or follow-up work. UI changes should include screenshots or a short recording when practical. Do not include credentials, private keys, environment files, or other sensitive data in commits, logs, screenshots, or descriptions.

Before requesting review, update the branch from `main`, run the relevant tests and lint/build checks, inspect the diff for unrelated changes, and confirm that the CI workflow passes. Keep review fixes on the same branch and respond to feedback with focused follow-up commits rather than force-pushing unless a maintainer explicitly requests it.

A typical contribution workflow is:

```bash
git switch main
git pull --ff-only upstream main
git switch --create feature/123-short-description
# make and test the change
git add <files>
git commit -m "feat(scope): describe the change"
git push --set-upstream origin feature/123-short-description
```

## General Principles

-   **Follow Existing Conventions:** When in doubt, look at the existing code in the file or related files and follow its patterns.
-   **Write Clear and Readable Code:** Write code that is easy for other developers to understand. Favor clarity over brevity.
-   **Keep it Simple:** Avoid unnecessary complexity.

---

## Frontend & SDK (TypeScript/JavaScript)

We use [Prettier](https://prettier.io/) for automatic code formatting and [ESLint](https://eslint.org/) for identifying and reporting on patterns in JavaScript.

### Formatting (Prettier)

All TypeScript/JavaScript code is formatted using Prettier. It's recommended to set up your editor to format on save. A `.prettierrc` file should be present in the project with the configuration.

**Example `.prettierrc`:**
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5"
}
```

### Linting (ESLint)

ESLint helps us to prevent bugs and ensure code quality. The configuration can be found in `eslint.config.mjs` (or similar). Please ensure your contributions have no ESLint errors.

### Naming Conventions

-   **Variables and Functions:** Use `camelCase`.
    -   `const myVariable = '...';`
    -   `function doSomething() { ... }`
-   **Classes, Interfaces, and React Components:** Use `PascalCase`.
    -   `class MyClass { ... }`
    -   `interface UserProfile { ... }`
    -   `function UserProfile() { ... }`
-   **Constants:** Use `UPPER_SNAKE_CASE` for constants that are hardcoded and reused across the application.
    -   `const MAX_RETRIES = 3;`

### Component Structure (Atomic Design)

We follow the principles of Atomic Design to structure our React components. This helps in creating a scalable and maintainable component library.

#### Reusable Components

Reusable components are located in the `src/components` directory and are categorized into the following levels:

-   **Atoms:** The smallest, indivisible UI elements. These are the building blocks of your application.
    -   **Location:** `src/components/atoms`
    -   **Examples:** `Button`, `Input`, `Label`, `Icon`

-   **Molecules:** Simple groups of atoms that form a functional unit.
    -   **Location:** `src/components/molecules`
    -   **Examples:** `SearchForm` (composed of an `Input` and a `Button`), `SocialLinks`

-   **Organisms:** More complex components that consist of molecules and/or atoms. These form distinct sections of an interface.
    -   **Location:** `src/components/organisms`
    -   **Examples:** `Header`, `Footer`, `Sidebar`

#### Page-Specific Components

Components that are specific to a particular page or route should not be placed in the global `components` directory. Instead, they should be located in a `modules` folder within the page's directory.

-   **Location:** `src/app/(pages)/<page-name>/modules`
-   **Example:** For a user profile page at `src/app/(pages)/profile/page.tsx`, a specific component like `ProfileHeader` would be located at `src/app/(pages)/profile/modules/ProfileHeader.tsx`.

### Imports

Organize imports at the top of the file in the following order:
1.  React imports
2.  External library imports
3.  Internal module imports (from the same project)
4.  Relative imports

### Comments

-   Use comments to explain *why* something is done, not *what* is being done. The code should be self-explanatory about what it does.
-   Use `// TODO:` for planned work.
-   Use `// FIXME:` for code that needs to be fixed.

---

## Smart Contracts (Rust)

For Rust code, we adhere to the standard Rust conventions, enforced by `rustfmt` and `clippy`.

### Formatting (`rustfmt`)

All Rust code is formatted using `rustfmt`. Ensure you have it installed (`rustup component add rustfmt`) and run `cargo fmt` before committing your changes.

### Linting (`clippy`)

Clippy is used to catch common mistakes and improve your code. Run `cargo clippy` to check your code for lints.

### Naming Conventions

-   **Variables and Functions:** Use `snake_case`.
    -   `let my_variable = 10;`
    -   `fn do_something() { ... }`
-   **Structs, Enums, and Traits:** Use `PascalCase`.
    -   `struct MyStruct { ... }`
    -   `enum MyEnum { ... }`
-   **Constants:** Use `UPPER_SNAKE_CASE`.
    -   `const MAX_VALUE: u32 = 100;`

### Documentation

-   Use doc comments (`///`) to document all public functions, structs, and enums. Explain what the item does, its parameters, and what it returns.
-   This documentation is used to generate the contract's API reference.