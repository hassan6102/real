import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, isValidMobile, identifierToEmail, normalizeAr, escapeHtml, toLatinDigits, actionText } from '../js/utils.js';

test('الأرقام الهندية تتحول للاتينية', () => assert.equal(toLatinDigits('٠١٠١٢٣٤٥٦٧٨'), '01012345678'));
test('تطبيع الهاتف بصيغ مختلفة', () => {
  for (const v of ['01012345678', '+201012345678', '00201012345678', '1012345678', '010 1234-5678', '٠١٠١٢٣٤٥٦٧٨'])
    assert.equal(normalizePhone(v), '01012345678', v);
});
test('التحقق من الموبايل', () => { assert.ok(isValidMobile('01512345678')); assert.ok(!isValidMobile('0161234567')); assert.ok(!isValidMobile('123')); });
test('الدخول بالهاتف أو البريد', () => {
  assert.equal(identifierToEmail('+20 101 234 5678'), '01012345678@team.app');
  assert.equal(identifierToEmail(' Admin@Mail.com '), 'admin@mail.com');
});
test('تطبيع النص العربي', () => { assert.equal(normalizeAr('الخانقة'), normalizeAr('الخانقه')); assert.equal(normalizeAr('أحمد'), normalizeAr('احمد')); assert.equal(normalizeAr('مُصطفى'), normalizeAr('مصطفي')); });
test('تهريب HTML', () => assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;'));
test('نص النشاط', () => { assert.equal(actionText('status_change'), 'غيّر حالة عقار'); assert.ok(actionText('??')); });
