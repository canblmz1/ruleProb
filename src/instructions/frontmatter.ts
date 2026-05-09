export interface InstructionFrontmatter {
  globs?: string[];
  alwaysApply?: boolean;
  description?: string;
}

const YAML_FRONT_OPEN = /^---\s*$/;
const YAML_FRONT_CLOSE = /^---\s*$/;

export function parseFrontmatter(content: string): { frontmatter: InstructionFrontmatter; body: string } {
  const lines = content.split('\n');
  if (!YAML_FRONT_OPEN.test(lines[0]?.trim() ?? '')) {
    return { frontmatter: {}, body: content };
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (YAML_FRONT_CLOSE.test(lines[i].trim())) {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) return { frontmatter: {}, body: content };

  const fmLines = lines.slice(1, closeIdx);
  const body = lines.slice(closeIdx + 1).join('\n');
  const frontmatter = parseSimpleYaml(fmLines);
  return { frontmatter, body };
}

function parseSimpleYaml(lines: string[]): InstructionFrontmatter {
  const result: InstructionFrontmatter = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (key === 'globs') {
      if (rest.startsWith('[')) {
        result.globs = rest.slice(1, rest.lastIndexOf(']'))
          .split(',')
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
      } else if (!rest) {
        const items: string[] = [];
        i++;
        while (i < lines.length && /^\s+-/.test(lines[i])) {
          items.push(lines[i].replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, '').trim());
          i++;
        }
        result.globs = items;
        continue;
      } else {
        result.globs = [rest.replace(/^["']|["']$/g, '')];
      }
    } else if (key === 'alwaysApply') {
      result.alwaysApply = rest === 'true';
    } else if (key === 'description') {
      result.description = rest.replace(/^["']|["']$/g, '');
    }
    i++;
  }

  return result;
}

export function fileMatchesGlobs(filePath: string, globs: string[]): boolean {
  if (globs.length === 0) return true;
  const normalized = filePath.replace(/\\/g, '/');
  return globs.some(pattern => {
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{DOUBLE}}/g, '.*');
    return new RegExp(`(^|/)${regexStr}($|/)`).test(normalized);
  });
}
