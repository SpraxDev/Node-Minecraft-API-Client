import { Utils } from '../../src/utils/Utils';

test('Check if strings are numeric', () => {
  expect(Utils.isNumeric('100'))
      .toBe(true);

  expect(Utils.isNumeric('99999999999999999999999999999999999999999999999999999999999999999'))
      .toBe(true);

  expect(Utils.isNumeric('0123456789'))
      .toBe(true);

  expect(Utils.isNumeric(''))
      .toBe(false);

  expect(Utils.isNumeric('100.0'))
      .toBe(false);

  expect(Utils.isNumeric('-100'))
      .toBe(false);
});

test('Test sleep 150ms', async () => {
  const start = Date.now();

  await Utils.sleep(150);

  const end = Date.now();
  const diff = end - start;

  expect(diff > 125 && diff < 175)
      .toBe(true);
});

test('Test sleep 1s', async () => {
  const start = Date.now();

  await Utils.sleep(1000);

  const end = Date.now();
  const diff = end - start;

  expect(diff > 950 && diff < 1050)
      .toBe(true);
});
