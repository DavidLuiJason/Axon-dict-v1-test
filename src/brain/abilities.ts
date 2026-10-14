/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase C1 — all self-description and ability answers come from capabilities.
 * Pure TypeScript: no React, device APIs, or Brain imports.
 */

import { listCapabilities, listChatActions } from '../capabilities';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'able', 'as', 'can', 'could', 'do', 'does', 'for',
  'how', 'i', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'please', 'the',
  'to', 'what', 'with', 'you', 'your', 'would', 'wouldn', 'there', 'this',
  'that', 'make', 'create', 'please',
]);

function contentWords(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((word) => word.length > 1 && !STOPWORDS.has(word))
  );
}

function actionMatches(action: { purpose: string; examples: string[] }, phrase: string): boolean {
  const requested = contentWords(phrase);
  if (requested.size === 0) return false;
  const known = contentWords([action.purpose, ...action.examples].join(' '));
  for (const word of requested) if (known.has(word)) return true;
  return false;
}

function abilityPhrase(text: string): string | null {
  const patterns = [
    /^what can you do with\s+(.+?)\s*[?.!]*$/i,
    /^can you\s+(.+?)\s*[?.!]*$/i,
    /^could you\s+(.+?)\s*[?.!]*$/i,
    /^are you able to\s+(.+?)\s*[?.!]*$/i,
    /^how do i\s+(.+?)\s*[?.!]*$/i,
  ];
  const clean = text.trim();
  for (const pattern of patterns) {
    const match = pattern.exec(clean);
    if (match?.[1]?.trim()) return match[1].trim().replace(/[?.!]+$/, '').trim();
  }
  return null;
}

export function describeAbilities(options: { lexiconExists?: boolean } = {}): string {
  const actions = listChatActions();
  const capabilities = listCapabilities();
  const available = actions.filter(({ action }) => action.status === 'available');
  const constrained = actions.filter(({ action }) =>
    action.status === 'needs-screen' || action.status === 'needs-permission'
  );
  const notBuilt = actions.filter(({ action }) => action.status === 'not-built');
  const noAction = capabilities.filter((capability) => !capability.chatActions?.length);

  const availableLines = available.map(({ action }, index) =>
    `${index + 1}. ${action.purpose}. Try: "${action.examples[0]}".`
  );
  const constrainedLines = constrained.map(({ capabilityName, action }) =>
    `- ${action.purpose}. Status: ${action.status === 'needs-screen' ? 'needs a screen' : 'needs permission'}. ` +
    `${action.note ? action.note : `Capability: ${capabilityName}.`}`
  );
  const notBuiltLines = notBuilt.map(({ action }) => `- ${action.purpose}`);
  const noActionLines = noAction.map((capability) =>
    `- ${capability.displayName}: ${capability.noChatAction ?? 'no chat action is registered.'}`
  );

  const sections = [
    'Here is what I can run right now:',
    availableLines.length ? availableLines.join('\n') : 'No available chat actions are registered.',
  ];
  if (constrainedLines.length) sections.push(`Needs a screen or permission:\n${constrainedLines.join('\n')}`);
  if (notBuiltLines.length) sections.push(`Not connected yet: ${notBuiltLines.join('; ')}.`);
  if (noActionLines.length) sections.push(`Capabilities with no chat action:\n${noActionLines.join('\n')}`);
  sections.push('I will not guess at anything I cannot do.');
  if (options.lexiconExists) sections.push('You can teach me words: say "remember that tally means count".');
  sections.push('Source: AXON capability registry.');
  return sections.join('\n\n');
}

export function answerAbilityQuestion(text: string): string | null {
  const phrase = abilityPhrase(text);
  if (!phrase) return null;

  const match = listChatActions().find(({ action }) => actionMatches(action, phrase));
  if (!match) {
    return `I have nothing registered for "${phrase}". Ask me "what can you do" to see everything I have registered.`;
  }

  const { action } = match;
  if (action.status === 'available') {
    return `Yes: ${action.purpose}. Try: "${action.examples[0]}".`;
  }
  if (action.status === 'not-built') return `Not built yet: ${action.purpose}.`;
  const state = action.status === 'needs-screen' ? 'This needs a screen' : 'This needs permission';
  return `${state}: ${action.purpose}.${action.note ? ` ${action.note}` : ''}`;
}
