import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../shell/user-character.js', import.meta.url), 'utf8');

test('user character refresh targets only the mounted character node', () => {
  assert.match(source, /document\.querySelector\(`\.ekodi-main-ekodian\[\$\{CHARACTER_ATTR\}\]`\)/);
  assert.doesNotMatch(source, /document\.querySelector\(`\[\$\{CHARACTER_ATTR\}\]`\)/);
});