import assert from 'node:assert/strict';
import test from 'node:test';
import { personalizedGuideMessages } from './personalizedGuideMessages.ts';
import { readFileSync } from 'node:fs';

const allScreens = [
  'inventoryHub', 'marketHub', 'weatherHub', 'fieldControlHub',
  'soilAnalysisHub', 'supportHub', 'agendaHub', 'nutritionHub',
  'pestGuideHub', 'producerMarketHub', 'fieldNotebookHub',
  'notificationsHub', 'settingsHub', 'calendar', 'aiAnalysis',
];

const context = {
  fieldName: 'Güney Parsel',
  crop: 'Buğday',
  city: 'Elazığ',
  district: 'Kovancılar',
  fieldCount: 2,
};

test('Pusula can provide two extra personalized messages on every covered screen', () => {
  for (const screen of allScreens) {
    const items = personalizedGuideMessages(screen, context);
    assert.equal(items.length, 2, screen);
    for (const item of items) {
      assert.ok(item.title.length > 4, screen);
      assert.ok(item.text.length > 45, screen);
      assert.ok(
        ['Güney Parsel', 'Buğday', 'Elazığ'].some((value) => item.text.includes(value)),
        screen,
      );
    }
  }
});

test('User data is never fabricated for anonymous users or empty field sets', () => {
  for (const screen of allScreens) {
    assert.deepEqual(personalizedGuideMessages(screen, {}), [], screen);
    assert.deepEqual(
      personalizedGuideMessages(screen, { ...context, fieldCount: 0 }),
      [],
      screen,
    );
  }
});

test('Missing crop/location produces only messages supported by recorded fields', () => {
  const withoutCrop = personalizedGuideMessages('marketHub', {
    fieldName: 'Deneme Tarlası', fieldCount: 1,
  });
  assert.equal(withoutCrop.length, 1);
  assert.match(withoutCrop[0].text, /Deneme Tarlası/);
  assert.ok(withoutCrop.every((item) => !item.text.includes('undefined')));

  const withoutLocation = personalizedGuideMessages('weatherHub', {
    fieldName: 'Deneme Tarlası', crop: 'Buğday', fieldCount: 1,
  });
  assert.equal(withoutLocation.length, 1);

  const missingCropText = personalizedGuideMessages('nutritionHub', {
    fieldName: 'Deneme Tarlası', crop: 'Ürün belirtilmedi', fieldCount: 1,
  });
  assert.equal(missingCropText.length, 1);
});

test('Global Pusula prioritizes real page insight and keeps guide turns across screen visits', () => {
  const global = readFileSync(new URL('../../../components/GlobalPusulaBand.tsx', import.meta.url), 'utf8');
  assert.match(global, /personalizedGuideMessages\(screen, context\)/);
  assert.match(global, /const guideTurn = nextGuideTurn\(/);
  assert.match(global, /if \(!latest\) \{/);
  assert.match(global, /tp_pusula_guide_rotation_v2/);
});
