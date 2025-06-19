# Contributing to ACpiano

Thanks for your interest in contributing to ACpiano! We welcome all contributions - bug reports, feature requests, and code.

## How to Contribute

1. **Fork the repository** and clone it locally.
2. **Create a new branch** for your changes:

```bash
git checkout -b my-feature
```

3. **Make your changes** - follow the existing code style and keep commits focused.
4. **Test your changes** before committing.
5. **Commit your changes** with clear, concise commit messages following [Conventional Commits](https://www.conventionalcommits.org/), and prefix them with `[client]` or `[server]` to indicate where the change applies.
6. **Push your branch** to your fork:

```bash
git push origin my-feature
```

7. **Open a Pull Request** describing your changes.

## Code Style

**JavaScript**:

- Use ES Modules (`import`/`export`).
- 2 spaces for indentation.
- Use semicolons at the end of statements.
- Use `const` and `let` instead of `var`.
- `camelCase` for variable and function names.
- `PascalCase` for class names.
- `UPPER_SNAKE_CASE` for constants.
- Keep modules focused on a single responsibility.
- Centralize DOM element selection in `dom.js`.
- Add comments if the result is not immediately clear.

**HTML:**

- Avoid inline styles, use CSS classes.
- Keep the structure clean and maintainable.

## Reporting Issues

If you find a bug or want to request a feature, please open an issue on GitHub. Include as much detail as possible to help us understand and reproduce the problem.

## Getting Help

If you have questions or need guidance, feel free to open an issue or reach out.

Thanks for helping improve ACpiano!
