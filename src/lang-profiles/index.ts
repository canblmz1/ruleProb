export interface LanguageProfile {
  id: string;
  label: string;
  packageManagers: string[];
  testRunners: string[];
  commandPrefixes: string[];
  formatterLinter: string[];
  exampleCommands: string[];
  examplePatterns: string[];
}

export const LANGUAGE_PROFILES: Record<string, LanguageProfile> = {
  'node': { id: 'node', label: 'Node.js / TypeScript', packageManagers: ['pnpm', 'npm', 'yarn', 'bun'], testRunners: ['vitest', 'jest', 'playwright', 'mocha'], commandPrefixes: ['pnpm', 'npm', 'yarn', 'bun', 'npx', 'node', 'vitest', 'playwright', 'tsc', 'turbo', 'nx'], formatterLinter: ['eslint', 'biome', 'prettier'], exampleCommands: ['pnpm test', 'pnpm typecheck', 'vitest run'], examplePatterns: ['any', 'class ', 'import type'] },
  'python': { id: 'python', label: 'Python', packageManagers: ['pip', 'poetry', 'uv', 'conda', 'pipenv'], testRunners: ['pytest', 'unittest', 'tox'], commandPrefixes: ['pip', 'poetry', 'uv', 'conda', 'python', 'pytest', 'tox', 'ruff', 'black', 'mypy', 'flake8'], formatterLinter: ['ruff', 'black', 'mypy', 'flake8', 'isort'], exampleCommands: ['pytest', 'poetry run pytest', 'ruff check .'], examplePatterns: ['print(', 'type: ignore', 'Any'] },
  'go': { id: 'go', label: 'Go', packageManagers: ['go mod'], testRunners: ['go test'], commandPrefixes: ['go', 'gofmt', 'golangci-lint', 'goimports'], formatterLinter: ['gofmt', 'golangci-lint', 'goimports', 'staticcheck'], exampleCommands: ['go test ./...', 'go build ./...', 'gofmt -w .'], examplePatterns: ['interface{}', 'panic(', 'err != nil'] },
  'rust': { id: 'rust', label: 'Rust', packageManagers: ['cargo'], testRunners: ['cargo test'], commandPrefixes: ['cargo', 'rustfmt', 'clippy'], formatterLinter: ['rustfmt', 'clippy'], exampleCommands: ['cargo test', 'cargo build', 'cargo clippy'], examplePatterns: ['unwrap()', 'panic!', 'unsafe {'] }
};

export function resolveLanguageProfile(lang?: string): LanguageProfile {
  if (lang && LANGUAGE_PROFILES[lang]) return LANGUAGE_PROFILES[lang];
  return LANGUAGE_PROFILES['node'];
}
