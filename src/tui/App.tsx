import React, { useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { Rule } from '../types/index.js';
import type { RuleSuggestion } from '../advisor/types.js';
import { generateScenarios } from '../scenarios/generate.js';

export interface AppProps {
  dir: string;
  rules: Rule[];
  suggestions: RuleSuggestion[];
}

type Tab = 1 | 2 | 3;

const SEVERITY_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'yellow',
  low: 'cyan',
};

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

function RulesView({ rules }: { rules: Rule[] }) {
  if (rules.length === 0) {
    return <Text dimColor>No rules found.</Text>;
  }
  return (
    <Box flexDirection="column">
      {rules.map((rule) => (
        <Box key={rule.id} flexDirection="row" gap={1}>
          <Text color={SEVERITY_COLOR[rule.severity] ?? 'white'}>
            [{rule.severity.toUpperCase()}]
          </Text>
          <Text dimColor>{rule.category}</Text>
          <Text>{truncate(rule.text, 60)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function ScenariosView({ rules }: { rules: Rule[] }) {
  const scenarios = generateScenarios(rules);
  if (scenarios.length === 0) {
    return <Text dimColor>No scenarios generated.</Text>;
  }
  return (
    <Box flexDirection="column">
      {scenarios.map((s) => (
        <Box key={s.id} flexDirection="row" gap={1}>
          <Text dimColor>[{s.ruleCategory ?? 'unknown'}]</Text>
          <Text>{truncate(s.prompt, 70)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function AdvisorView({ suggestions }: { suggestions: RuleSuggestion[] }) {
  if (suggestions.length === 0) {
    return <Text dimColor>No suggestions found.</Text>;
  }
  return (
    <Box flexDirection="column">
      {suggestions.map((s, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={SEVERITY_COLOR[s.severity] ?? 'white'}>
              [{s.severity.toUpperCase()}]
            </Text>
            <Text bold>{s.category}</Text>
          </Box>
          <Text>{s.text}</Text>
          <Text dimColor>{truncate(s.reason, 80)}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function App({ dir, rules, suggestions }: AppProps) {
  const [tab, setTab] = useState<Tab>(1);
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    } else if (input === '1') {
      setTab(1);
    } else if (input === '2') {
      setTab(2);
    } else if (input === '3') {
      setTab(3);
    }
  });

  const scenarios = generateScenarios(rules);

  const tabLabel = (n: Tab, label: string, count: number): string => {
    const active = tab === n;
    const text = `[${n}] ${label} (${count})`;
    return active ? `[1m${text}[0m` : text;
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="single" borderColor="cyan">
      {/* Header */}
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text bold color="cyan">RuleProbe TUI</Text>
        <Text>{tabLabel(1, 'Rules', rules.length)}</Text>
        <Text>{tabLabel(2, 'Scenarios', scenarios.length)}</Text>
        <Text>{tabLabel(3, 'Advisor', suggestions.length)}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>Dir: {dir}</Text>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text dimColor>{'─'.repeat(60)}</Text>
      </Box>

      {/* View content */}
      <Box flexDirection="column" flexGrow={1} minHeight={10}>
        {tab === 1 && <RulesView rules={rules} />}
        {tab === 2 && <ScenariosView rules={rules} />}
        {tab === 3 && <AdvisorView suggestions={suggestions} />}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>Press 1/2/3 to switch tabs  |  q to quit</Text>
      </Box>
    </Box>
  );
}
