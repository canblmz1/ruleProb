import { Config } from '../types/index.js';
import fs from 'fs-extra';
import path from 'path';

export interface BadgeConfig {
  label?: string;
  color?: string;
  style?: 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';
}

export function generateScoreBadge(score: number, weightedScore: number, options: BadgeConfig = {}): string {
  const safeScore = Math.min(100, Math.max(0, Math.round(isFinite(score) ? score : 0)));
  const label = options.label || 'ruleprobe';
  const style = options.style || 'flat';
  const color = options.color || scoreColor(safeScore);
  const message = `${safeScore}%20/%20100`;

  if (style === 'flat-square') {
    return generateFlatSquareBadge(label, message, color);
  }
  if (style === 'plastic') {
    return generatePlasticBadge(label, message, color);
  }
  if (style === 'for-the-badge') {
    return generateForTheBadge(label, message, color);
  }
  return generateFlatBadge(label, message, color);
}

export function generateTrendBadge(direction: 'up' | 'down' | 'same', delta: number, options: BadgeConfig = {}): string {
  const label = options.label || 'trend';
  const color = direction === 'up' ? '2ea44f' : direction === 'down' ? 'cb2431' : '6c757d';
  const message = direction === 'up' ? `%2B${delta}` : direction === 'down' ? `-${delta}` : 'stable';
  return generateFlatBadge(label, message, color);
}

export async function writeBadgeFiles(
  score: number,
  weightedScore: number,
  trend: { direction: 'up' | 'down' | 'same'; delta: number } | undefined,
  config: Config
): Promise<{ scorePath: string; trendPath?: string }> {
  await fs.ensureDir(config.reportDir);

  const scoreSvg = generateScoreBadge(score, weightedScore, { style: 'flat' });
  const scorePath = path.join(config.reportDir, 'badge-score.svg');
  await fs.writeFile(scorePath, scoreSvg, 'utf-8');

  let trendPath: string | undefined;
  if (trend) {
    const trendSvg = generateTrendBadge(trend.direction, trend.delta, { style: 'flat' });
    trendPath = path.join(config.reportDir, 'badge-trend.svg');
    await fs.writeFile(trendPath, trendSvg, 'utf-8');
  }

  return { scorePath, trendPath };
}

/**
 * Generate a shields.io endpoint JSON file.
 * Usage: https://img.shields.io/endpoint?url=<raw-url-to-badge.json>
 * See: https://shields.io/endpoint
 */
export interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
  style?: string;
  namedLogo?: string;
}

export function generateShieldsEndpoint(score: number, options: BadgeConfig = {}): ShieldsEndpoint {
  const safeScore = Math.min(100, Math.max(0, Math.round(isFinite(score) ? score : 0)));
  const color = options.color ?? shieldsColor(safeScore);
  return {
    schemaVersion: 1,
    label: options.label ?? 'ruleprobe',
    message: `${safeScore} / 100`,
    color,
    style: options.style ?? 'flat',
  };
}

export async function writeShieldsEndpoint(
  score: number,
  config: Config,
  coverage?: { pct: number }
): Promise<string> {
  await fs.ensureDir(config.reportDir);
  const safeScore = Math.min(100, Math.max(0, Math.round(isFinite(score) ? score : 0)));
  const endpoint = generateShieldsEndpoint(score);
  if (coverage !== undefined) {
    endpoint.message = `${safeScore} / 100 · ${coverage.pct}% coverage`;
  }
  const endpointPath = path.join(config.reportDir, 'badge.json');
  await fs.writeFile(endpointPath, JSON.stringify(endpoint, null, 2), 'utf-8');
  return endpointPath;
}

function shieldsColor(score: number): string {
  if (score >= 90) return 'brightgreen';
  if (score >= 70) return 'blue';
  if (score >= 50) return 'yellow';
  if (score >= 30) return 'orange';
  return 'red';
}

function scoreColor(score: number): string {
  if (score >= 90) return '2ea44f';
  if (score >= 70) return '4c8bf5';
  if (score >= 50) return 'f5a623';
  if (score >= 30) return 'e67e22';
  return 'cb2431';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += (char.charCodeAt(0) > 127) ? 8 : 6;
  }
  return Math.max(width + 10, 40);
}

function generateFlatBadge(label: string, message: string, color: string): string {
  const labelWidth = textWidth(label);
  const messageWidth = textWidth(message);
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(label)}: ${escapeXml(message)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="#${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function generateFlatSquareBadge(label: string, message: string, color: string): string {
  const labelWidth = textWidth(label);
  const messageWidth = textWidth(message);
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="20" role="img" aria-label="${escapeXml(label)}: ${escapeXml(message)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <g>
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="#${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function generatePlasticBadge(label: string, message: string, color: string): string {
  const labelWidth = textWidth(label);
  const messageWidth = textWidth(message);
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="18" role="img" aria-label="${escapeXml(label)}: ${escapeXml(message)}">
  <title>${escapeXml(label)}: ${escapeXml(message)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-opacity=".3"/>
    <stop offset="1" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="18" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="18" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="18" fill="#${color}"/>
    <rect width="${totalWidth}" height="18" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="13">${escapeXml(label)}</text>
    <text x="${labelWidth + messageWidth / 2}" y="13">${escapeXml(message)}</text>
  </g>
</svg>`;
}

function generateForTheBadge(label: string, message: string, color: string): string {
  const labelWidth = textWidth(label) + 20;
  const messageWidth = textWidth(message) + 20;
  const totalWidth = labelWidth + messageWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalWidth}" height="28" role="img" aria-label="${escapeXml(label.toUpperCase())}: ${escapeXml(message.toUpperCase())}">
  <title>${escapeXml(label.toUpperCase())}: ${escapeXml(message.toUpperCase())}</title>
  <g>
    <rect width="${labelWidth}" height="28" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="28" fill="#${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="12" font-weight="bold">
    <text x="${labelWidth / 2}" y="18">${escapeXml(label.toUpperCase())}</text>
    <text x="${labelWidth + messageWidth / 2}" y="18">${escapeXml(message.toUpperCase())}</text>
  </g>
</svg>`;
}
