import { describe, expect, test } from 'vitest';
import {
  derivePagePattern,
  isConfigured,
  normaliseEndpoint,
  originPermission,
} from '../src/config.js';

describe('normaliseEndpoint', () => {
  test('accepts a full https url and returns it unchanged', () => {
    expect(normaliseEndpoint('https://example.com/api/chats'))
      .toBe('https://example.com/api/chats');
  });

  test('trims surrounding whitespace from a pasted url', () => {
    expect(normaliseEndpoint('  https://example.com/api/chats  '))
      .toBe('https://example.com/api/chats');
  });

  test('rejects an empty value', () => {
    expect(() => normaliseEndpoint('   ')).toThrow(/enter/i);
  });

  test('rejects something that is not a url', () => {
    expect(() => normaliseEndpoint('not a url')).toThrow(/full address/i);
  });

  test('rejects a url with no scheme, rather than guessing one', () => {
    expect(() => normaliseEndpoint('example.com/api/chats')).toThrow(/full address/i);
  });

  test('rejects a scheme that is not http or https', () => {
    expect(() => normaliseEndpoint('ftp://example.com/api')).toThrow(/https/i);
  });
});

describe('originPermission', () => {
  test('asks for the whole origin, which is what Chrome grants', () => {
    expect(originPermission('https://example.com/api/chats'))
      .toBe('https://example.com/*');
  });

  test('keeps a non-default port, since it is part of the origin', () => {
    expect(originPermission('https://example.com:8443/api/chats'))
      .toBe('https://example.com:8443/*');
  });
});

describe('derivePagePattern', () => {
  test('defaults to every page on the same origin', () => {
    expect(derivePagePattern('https://example.com/api/chats'))
      .toBe('https://example.com/*');
  });
});

describe('isConfigured', () => {
  test('is false before an endpoint has been saved', () => {
    expect(isConfigured({ endpoint: '' })).toBe(false);
  });

  test('is false when the setting is missing entirely', () => {
    expect(isConfigured({})).toBe(false);
  });

  test('is true once an endpoint is present', () => {
    expect(isConfigured({ endpoint: 'https://example.com/api/chats' })).toBe(true);
  });
});
