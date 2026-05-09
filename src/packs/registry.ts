export interface RulePack {
  name: string;
  description: string;
  tags: string[];
  rules: string[];
}

export const BUILT_IN_PACKS: Record<string, RulePack> = {
  'typescript-strict': {
    name: 'typescript-strict',
    description: 'Strict TypeScript rules: no any, no non-null assertions, no require()',
    tags: ['typescript', 'types', 'safety'],
    rules: [
      '- NEVER use `any` in TypeScript — use `unknown` for external data.',
      '- NEVER use non-null assertions (`!`). Handle null/undefined explicitly.',
      '- Do not use `require()` — use ES module `import` syntax.',
      '- NEVER use `@ts-ignore` or `@ts-expect-error` without a comment explaining why.',
      '- Prefer explicit return types on exported functions.',
    ]
  },
  'security': {
    name: 'security',
    description: 'Security best practices: no secrets in code, input validation, safe deps',
    tags: ['security', 'secrets', 'validation'],
    rules: [
      '- NEVER hardcode secrets, API keys, or passwords in source files.',
      '- NEVER disable CORS globally or set `Access-Control-Allow-Origin: *` in production.',
      '- ALWAYS validate and sanitize user input at system boundaries.',
      '- Do not use `eval()` or `new Function()` with user-controlled input.',
      '- NEVER log sensitive data (passwords, tokens, PII) to console or log files.',
      '- ALWAYS use parameterized queries — never concatenate SQL strings.',
    ]
  },
  'monorepo': {
    name: 'monorepo',
    description: 'Monorepo conventions: package scoping, shared configs, cross-package imports',
    tags: ['monorepo', 'packages', 'structure'],
    rules: [
      '- ALWAYS use `pnpm` for package management. Never use npm or yarn.',
      '- NEVER import across package boundaries using relative paths — use package names.',
      '- Do not modify `package.json` at the root without reviewing all workspace packages.',
      '- ALWAYS run `pnpm typecheck` before marking a task complete.',
      '- ALWAYS run `pnpm test` before marking a task complete.',
      '- Do not publish individual packages manually — use the release workflow.',
    ]
  },
  'react': {
    name: 'react',
    description: 'React best practices: hooks rules, no class components, accessibility',
    tags: ['react', 'frontend', 'hooks'],
    rules: [
      '- NEVER use class components — use functional components with hooks.',
      '- NEVER call hooks inside conditions, loops, or nested functions.',
      '- Avoid `useEffect` for data fetching — prefer a dedicated data-fetching library.',
      '- NEVER use `dangerouslySetInnerHTML` without sanitizing the HTML first.',
      '- ALWAYS add accessible `aria-label` or visible text to icon-only buttons.',
      '- Do not use array index as `key` in lists that can reorder or change.',
    ]
  },
  'git-hygiene': {
    name: 'git-hygiene',
    description: 'Git workflow rules: no direct commits, branch naming, PR requirements',
    tags: ['git', 'workflow', 'collaboration'],
    rules: [
      '- NEVER run `git commit` directly — use the project PR workflow.',
      '- NEVER run `git push --force` on shared branches.',
      '- NEVER run `git reset --hard` without confirming there is no unsaved work.',
      '- Do not commit build artifacts, `.env` files, or `node_modules/`.',
      '- ALWAYS write descriptive commit messages (not just "fix" or "update").',
    ]
  },
};

export function listPacks(): RulePack[] {
  return Object.values(BUILT_IN_PACKS);
}

export function getPack(name: string): RulePack | undefined {
  return BUILT_IN_PACKS[name];
}
