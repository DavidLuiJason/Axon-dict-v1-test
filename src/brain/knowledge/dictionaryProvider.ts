/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A deterministic Brain provider for explicit English dictionary lookups only.
 */
import type { BrainProvider, BrainReply, BrainRequest } from '../types';
import { dictionarySlot } from './dictionarySlot';
import type { KnowledgeSlot } from './slot';

const PROVIDER_ID = 'english-dictionary';
const SOURCE = 'Open English WordNet 2025';

/** Accept only a complete, explicit lookup phrase with a short word/phrase target. */
function lookupTerm(message: string): string | null {
  const text = message.trim().replace(/[?.!,;:]+$/g, '').trim();
  const patterns = [
    /^define\s+(.+)$/i,
    /^what does\s+(.+?)\s+mean$/i,
    /^meaning of\s+(.+)$/i,
    /^definition of\s+(.+)$/i,
    /^what is the meaning of\s+(.+)$/i,
    /^what is the definition of\s+(.+)$/i,
  ];
  let candidate: string | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      candidate = match[1].trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
      break;
    }
  }
  if (!candidate) return null;

  // Do not reinterpret the lexicon's "define X as Y" teaching syntax as a lookup.
  if (/\b(?:as|means|stands\s+for)\b/i.test(candidate)) return null;
  if (!/^[\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*(?:\s+[\p{L}\p{M}]+(?:[’'\-][\p{L}\p{M}]+)*){0,3}$/u.test(candidate)) return null;
  return candidate.replace(/\s+/g, ' ');
}

function sourceLine(source: string, version: string): string {
  return `Source: ${source} ${version}.`;
}

export function createDictionaryProvider(slot: KnowledgeSlot = dictionarySlot): BrainProvider {
  return {
    id: PROVIDER_ID,
    label: 'English dictionary',
    status() {
      const state = slot.status();
      return {
        id: PROVIDER_ID,
        label: 'English dictionary',
        ready: state.ready,
        note: state.note ?? `${state.source} ${state.version}; opens on first lookup`,
      };
    },
    holdsConversation: () => false,
    async handle(request: BrainRequest): Promise<BrainReply | null> {
      const word = lookupTerm(request.text);
      if (!word) return null;
      const result = await slot.lookup(word);
      const citation = sourceLine(result.source, result.version);

      if (result.status === 'not-found') {
        return {
          source: PROVIDER_ID,
          content: `I do not have that word: ${word}.\n\n${citation}`,
        };
      }
      if (result.status === 'error') {
        return {
          source: PROVIDER_ID,
          content: `I could not check “${word}” because the dictionary returned an error: ${result.message}\n\n${citation}`,
        };
      }

      const lines = result.senses.slice(0, 3).map((sense, index) =>
        `${index + 1}. ${sense.partOfSpeech}: ${sense.meaning}${sense.example ? `\n   Example: ${sense.example}` : ''}`,
      );
      return {
        source: PROVIDER_ID,
        content: `${result.word}\n\n${lines.join('\n')}\n\n${citation}`,
      };
    },
  };
}
