/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase C1 — capability registry is the source of truth for chat abilities.
 */
import { registerCapability, listCapabilities, listChatActions, getCapability } from '../src/capabilities';
import type { ChatAction } from '../src/capabilities/types';
import { registerAxonToolsCapability } from '../src/capabilities/registerAxonTools';
import { registerSettingsCapability } from '../src/capabilities/registerSettings';
import { registerAxonSourceCapability } from '../src/capabilities/registerAxonSource';
import { registerInterfaceCaptureCapability } from '../src/capabilities/registerInterfaceCapture';
import { registerBackgroundProofCapability } from '../src/capabilities/registerBackgroundProof';
import { registerDictionaryCapability } from '../src/capabilities/registerDictionary';
import { registerPlannedCapabilities } from '../src/capabilities/registerPlanned';
import { BRAIN_COMMANDS, BRAIN_PROVIDER_IDS } from '../src/brain';
import { answerAbilityQuestion, describeAbilities } from '../src/brain/abilities';
import { PLANNED_SOURCES } from '../src/brain/brain';
import { createDictionaryProvider } from '../src/brain/knowledge/dictionaryProvider';
import { getAxonEngine } from '../src/kernel/axonEngine';

let checks = 0;
function assert(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  OK: ${message}`);
}

function main(): void {
  registerAxonToolsCapability();
  registerSettingsCapability();
  registerAxonSourceCapability();
  registerInterfaceCaptureCapability();
  registerBackgroundProofCapability();
  registerDictionaryCapability();
  registerPlannedCapabilities();

  const actions = listChatActions();
  const ids = actions.map(({ action }) => action.id);
  const kernelActions = getAxonEngine().listActions();
  const commandIds = new Set(BRAIN_COMMANDS.map((command) => command.id));
  const commandActionIds = new Map(BRAIN_COMMANDS.map((command) => [command.id, command.actionId]));
  const providerIds = new Set(BRAIN_PROVIDER_IDS);
  const kernelActionIds = new Set(kernelActions.map((action) => action.id));

  console.log('-- implementation links');
  for (const command of BRAIN_COMMANDS) {
    const registered = actions.find(({ action }) => action.link?.commandId === command.id);
    assert(registered !== undefined, `command ${command.id} has a registry action`);
    assert(registered?.action.link?.actionId === commandActionIds.get(command.id), `command ${command.id} links to its exact kernel action`);
  }
  for (const providerId of BRAIN_PROVIDER_IDS) {
    assert(actions.some(({ action }) => action.link?.providerId === providerId), `provider ${providerId} has a registry action`);
  }
  for (const kernelAction of kernelActions) {
    assert(actions.some(({ action }) => action.link?.actionId === kernelAction.id), `kernel action ${kernelAction.id} has a registry action`);
  }
  assert(createDictionaryProvider().id === BRAIN_PROVIDER_IDS[0], 'provider id comes from the real dictionary provider');
  for (const { action } of actions) {
    if (action.link?.commandId) assert(commandIds.has(action.link.commandId), `link command ${action.link.commandId} exists`);
    if (action.link?.providerId) assert(providerIds.has(action.link.providerId), `link provider ${action.link.providerId} exists`);
    if (action.link?.actionId) assert(kernelActionIds.has(action.link.actionId), `link kernel action ${action.link.actionId} exists`);
  }

  console.log('-- planned actions and unique identities');
  for (const planned of PLANNED_SOURCES) {
    const action = actions.find(({ capabilityId }) => capabilityId === `cap.planned.${planned.id}`)?.action;
    assert(action !== undefined, `planned source ${planned.id} has an action`);
    assert(action?.id === `act.planned.${planned.id}` && action.status === 'not-built', `planned source ${planned.id} is honestly not built`);
  }
  assert(new Set(ids).size === ids.length, 'chat action ids are unique across the entire registry');

  console.log('-- registry-backed description');
  const description = describeAbilities({ lexiconExists: true });
  for (const { action } of actions.filter(({ action }) => action.status === 'available' || action.status === 'not-built')) {
    assert(description.includes(action.purpose), `description includes registered purpose: ${action.purpose}`);
  }
  for (const { action } of actions) {
    assert(description.includes(action.purpose), `description only describes registered action purpose: ${action.purpose}`);
  }
  assert(description.startsWith('Here is what I can run right now:'), 'description keeps the established opening');
  assert(description.includes('Not connected yet:') && description.includes('I will not guess at anything I cannot do.'), 'description keeps the honest disconnected wording');
  assert(description.includes('You can teach me words:'), 'description includes the lexicon hint when it exists');
  assert(description.endsWith('Source: AXON capability registry.'), 'description names the capability registry as its source');
  assert(description.includes('Background Proof: proof only') && description.includes('Interface Capture: shell only'), 'description explains the two capabilities without chat actions');
  assert(!/\b(collage|video|text to speech)\b/i.test(description), 'description does not claim unregistered future media abilities');

  console.log('-- questions do not steal dictionary requests');
  assert(answerAbilityQuestion('define the word bank') === null, 'dictionary phrase "define the word bank" is not an ability question');
  assert(answerAbilityQuestion('define bank') === null, 'dictionary phrase "define bank" is not an ability question');
  const unknown = answerAbilityQuestion('can you make a collage?');
  assert(unknown !== null && unknown.includes('I have nothing registered for "make a collage"'), 'an unregistered collage request is reported as unregistered');

  console.log('-- adding an action changes the answer without changing abilities.ts');
  const dummyAction: ChatAction = {
    id: 'act.test-collage',
    purpose: 'Make a collage from supplied images',
    examples: ['make a collage'],
    status: 'not-built',
    inputs: [{ name: 'style', kind: 'choice', choices: ['grid', 'mosaic'] }],
  };
  registerCapability({
    id: 'cap.test-collage',
    displayName: 'Test Collage',
    contractVersion: '1.0.0',
    implementationVersion: '0.0.0-test',
    chatActions: [dummyAction],
  });
  const afterRegistration = answerAbilityQuestion('can you make a collage?');
  assert(afterRegistration === 'Not built yet: Make a collage from supplied images.', 'a registry-only dummy action changes the answer to Not built yet');
  assert(getCapability('cap.test-collage') !== undefined && listCapabilities().some((capability) => capability.id === 'cap.test-collage'), 'the dummy capability is registered');
  dummyAction.examples[0] = 'mutated source example';
  dummyAction.inputs![0].choices![0] = 'mutated source choice';
  const copiedDummy = listChatActions().find(({ action }) => action.id === 'act.test-collage')?.action;
  assert(copiedDummy?.examples[0] === 'make a collage' && copiedDummy.inputs?.[0].choices?.[0] === 'grid', 'registration deep-copies examples and nested input choices');

  console.log('-- registry copies and validation');
  const dictionary = getCapability('cap.english-dictionary');
  if (dictionary?.chatActions?.[0]) {
    dictionary.chatActions[0].examples[0] = 'mutated caller copy';
  }
  assert(listChatActions().find(({ capabilityId }) => capabilityId === 'cap.english-dictionary')?.action.examples[0] === 'define bank', 'nested registry data cannot be mutated by callers');
  let duplicateRejected = false;
  try {
    registerCapability({
      id: 'cap.duplicate-test',
      displayName: 'Duplicate Test',
      contractVersion: '1.0.0',
      implementationVersion: '1.0.0',
      chatActions: [{ id: 'act.text-counter', purpose: 'duplicate', examples: ['duplicate'], status: 'available' }],
    });
  } catch (error) {
    duplicateRejected = error instanceof Error && error.message.includes('duplicate chat action id: act.text-counter');
  }
  assert(duplicateRejected, 'duplicate action ids fail with a clear registry error');

  console.log(`=== capability truth tests passed: ${checks} checks ===`);
}

main();
