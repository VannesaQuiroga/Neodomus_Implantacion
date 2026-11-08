export type LanguageCode = 'es' | 'en';

export type LocalizedMessage = Record<string, string>;

type TemplatePart =
  | { type: 'text'; value: string }
  | { type: 'variable'; name: string };

function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let cursor = 0;

  while (cursor < template.length) {
    const openingBrace = template.indexOf('{', cursor);
    if (openingBrace < 0) {
      parts.push({ type: 'text', value: template.slice(cursor) });
      break;
    }

    const closingBrace = template.indexOf('}', openingBrace + 1);
    if (closingBrace < 0 || closingBrace === openingBrace + 1) {
      parts.push({ type: 'text', value: template.slice(cursor, openingBrace + 1) });
      cursor = openingBrace + 1;
      continue;
    }

    if (openingBrace > cursor) {
      parts.push({ type: 'text', value: template.slice(cursor, openingBrace) });
    }
    parts.push({
      type: 'variable',
      name: template.slice(openingBrace + 1, closingBrace),
    });
    cursor = closingBrace + 1;
  }

  return parts;
}

function matchTemplate(template: string, message: string): Record<string, string> | null {
  const parts = splitTemplate(template);
  const values: Record<string, string> = {};
  let cursor = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.type === 'text') {
      if (!message.startsWith(part.value, cursor)) return null;
      cursor += part.value.length;
      continue;
    }

    const nextText = parts
      .slice(index + 1)
      .find((nextPart) => nextPart.type === 'text' && nextPart.value.length > 0);

    if (nextText?.type === 'text') {
      const valueEnd = message.indexOf(nextText.value, cursor);
      if (valueEnd < 0) return null;
      values[part.name] = message.slice(cursor, valueEnd);
      cursor = valueEnd;
      continue;
    }

    const hasFollowingVariable = parts.slice(index + 1).some((nextPart) => nextPart.type === 'variable');
    if (hasFollowingVariable) {
      if (cursor >= message.length) return null;
      values[part.name] = message.slice(cursor, cursor + 1);
      cursor += 1;
    } else {
      values[part.name] = message.slice(cursor);
      cursor = message.length;
    }
  }

  return cursor === message.length ? values : null;
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return splitTemplate(template)
    .map((part) => {
      if (part.type === 'text') return part.value;
      return Object.prototype.hasOwnProperty.call(values, part.name)
        ? values[part.name]
        : `{${part.name}}`;
    })
    .join('');
}

function hasVariables(template: string): boolean {
  return splitTemplate(template).some((part) => part.type === 'variable');
}

/** Translates a fixed or parameterized notification without regular expressions. */
export function translateLocalizedMessage<T extends LocalizedMessage>(
  message: string,
  language: LanguageCode,
  dictionary: Record<string, T>,
): string {
  if (!message || language === 'es') return message;

  const entries = Object.values(dictionary);
  for (const translation of entries) {
    const source = translation.es;
    const target = translation.en;
    if (!source || !target) continue;

    const values = matchTemplate(source, message);
    if (values) return renderTemplate(target, values);
  }

  return entries.reduce((translated, translation) => {
    if (!translation.es || !translation.en || hasVariables(translation.es)) return translated;
    return translated.split(translation.es).join(translation.en);
  }, message);
}
