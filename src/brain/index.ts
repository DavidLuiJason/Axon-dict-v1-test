/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The one Brain the app uses, with its sources wired in. New sources and new
 * commands are added here and nowhere else.
 */

import { getAxonEngine } from '../kernel/axonEngine';
import { createBrain, PLANNED_SOURCES, type Brain } from './brain';
import { createFoundation } from './foundation';
import { createUserLexicon, type KeyValueStore, type UserLexicon } from './lexicon';
import { createLocalRules } from './localRules';
import { createDictionaryProvider } from './knowledge/dictionaryProvider';
import { TEXT_COUNT_COMMAND } from './textCountCommand';
import { answerAbilityQuestion, answerRequestFallback, describeAbilities } from './abilities';

export const BRAIN_COMMANDS = [TEXT_COUNT_COMMAND];
const BRAIN_PROVIDERS = [createDictionaryProvider()];
export const BRAIN_PROVIDER_IDS = BRAIN_PROVIDERS.map((provider) => provider.id);

let shared: Brain | null = null;
let sharedLexicon: UserLexicon | null = null;

function phoneStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The owner's taught meanings (user data, kept on this phone only). */
export function getUserLexicon(): UserLexicon {
  if (!sharedLexicon) sharedLexicon = createUserLexicon(phoneStorage());
  return sharedLexicon;
}

export function getAxonBrain(): Brain {
  if (!shared) {
    const localRules = createLocalRules({
      commands: BRAIN_COMMANDS,
      engine: getAxonEngine(),
      planned: PLANNED_SOURCES,
      lexicon: getUserLexicon(),
      abilities: {
        describe: () => describeAbilities({ lexiconExists: true }),
        answer: answerAbilityQuestion,
      },
    });
    shared = createBrain([localRules, ...BRAIN_PROVIDERS], createFoundation({ abilities: { answerRequestFallback } }));
  }
  return shared;
}
