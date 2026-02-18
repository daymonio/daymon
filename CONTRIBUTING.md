# Contributing to Daymon

Thanks for your interest in contributing! Daymon is open source and we welcome contributions of all kinds.

## Getting Started

```bash
git clone https://github.com/daymonio/daymon.git
cd daymon
npm install
npm run dev
```

## Development

- `npm run dev` — Start dev mode
- `npm test` — Run the test suite
- `npm run typecheck` — TypeScript type checking
- `npm run build` — Full production build

## Before Submitting a PR

1. Run `npm run typecheck` — no type errors
2. Run `npm test` — all tests pass
3. If you added new functionality, add tests for it

## What to Contribute

- Bug fixes
- New worker templates
- Documentation improvements
- UI/UX improvements
- Test coverage

## Code Style

- TypeScript throughout
- Shared logic goes in `src/shared/` (no platform dependencies)
- MCP tools go in `src/mcp/tools/`
- Keep it simple — avoid over-engineering

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

