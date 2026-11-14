const CODE_KEYS: Record<string, string> = { Slash: '/', Comma: ',' };

export function shortcutKey(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const letter = /^Key([A-Z])$/.exec(event.code);
  if (letter) return letter[1].toLowerCase();
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(event.code);
  if (digit) return digit[1];
  return CODE_KEYS[event.code] ?? event.key;
}
