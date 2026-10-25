import { CONVERSATION_TITLE_MAX, type GenUIMessage } from '@gen-ui/shared';
import { cleanTitle, firstQuestion, provisionalTitle } from './conversation-title.js';

const message = (role: 'user' | 'assistant', ...texts: string[]): GenUIMessage =>
  ({ id: `${role}-${texts.join()}`, role, parts: texts.map((text) => ({ type: 'text' as const, text })) }) as GenUIMessage;

describe('firstQuestion', () => {
  it("is the first user message's text, whitespace collapsed", () => {
    const messages = [message('user', '  Which pumps\n\nare   offline? ', 'At Riverside'), message('assistant', 'Two.')];
    expect(firstQuestion(messages)).toBe('Which pumps are offline? At Riverside');
  });

  it('is empty without a user message', () => {
    expect(firstQuestion([message('assistant', 'Hello')])).toBe('');
  });
});

describe('provisionalTitle', () => {
  it('keeps a short question as it is', () => {
    expect(provisionalTitle([message('user', 'Who is on duty?')])).toBe('Who is on duty?');
  });

  it('clips a long question to the maximum, ending in an ellipsis', () => {
    const title = provisionalTitle([message('user', 'word '.repeat(40))]);
    expect(title).toHaveLength(CONVERSATION_TITLE_MAX);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('cleanTitle', () => {
  it.each([
    ['Offline pumps at Riverside', 'Offline pumps at Riverside'],
    ['"Offline pumps at Riverside"', 'Offline pumps at Riverside'],
    ['"Offline pumps at Riverside".', 'Offline pumps at Riverside'],
    ['Offline pumps at Riverside.', 'Offline pumps at Riverside'],
    ['Title: Offline pumps', 'Offline pumps'],
    ['**Title:** Offline pumps', 'Offline pumps'],
    ['# Offline pumps', 'Offline pumps'],
    ['„Dežurni ove nedelje“', 'Dežurni ove nedelje'],
    ['Offline pumps\nThis title covers…', 'Offline pumps'],
    ['Who is on duty?', 'Who is on duty?'],
  ])('%j → %j', (raw, expected) => {
    expect(cleanTitle(raw)).toBe(expected);
  });

  it('is null when nothing is left', () => {
    expect(cleanTitle('  ""  ')).toBeNull();
    expect(cleanTitle('')).toBeNull();
  });

  it('clips a long reply to the maximum', () => {
    expect(cleanTitle('x'.repeat(200))).toHaveLength(CONVERSATION_TITLE_MAX);
  });
});
