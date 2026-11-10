import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecareAreaInput } from './parseDecareAreaInput.ts';

test('Türkçe binlik ve ondalık ayırıcıyla girilen dekar doğru çözülür', () => {
  for (const [input, expected] of [
    ['5618', 5618],
    ['5.618', 5618],
    ['5.618,324', 5618.324],
    ['5,5', 5.5],
    ['5.5', 5.5],
    ['5,618', 5.618],
    ['1.234.567,89', 1234567.89],
    ['5,618.324', 5618.324],
    [' 5.618,324 ', 5618.324],
  ]) {
    assert.equal(parseDecareAreaInput(input), expected, input);
  }
});

test('Boş veya geçersiz sayı girilince kayıt reddedilebilir', () => {
  for (const input of ['', ' ', '5.6.18', '12,34,56', '5abc', '1e5']) {
    assert.ok(Number.isNaN(parseDecareAreaInput(input)), input);
  }
});
