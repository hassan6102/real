import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDoc, validate, diffKeys, listFilters, shareText, archiveFor, flatten } from '../js/property-model.js';

test('الحقول الفارغة لا تُخزَّن ولا تتحول لأصفار', () => {
  const { pub } = buildDoc({ propertyType: 'apartment', rooms: '', bathrooms: '  ', price: '٩٥٠,٠٠٠', area: '130' });
  assert.equal(pub.price, 950000); assert.equal(pub.area, 130);
  assert.ok(!('rooms' in pub) && !('bathrooms' in pub));
});
test('الصفر الصريح يُحفظ (الدور الأرضي)', () => assert.equal(buildDoc({ floor: '0' }).pub.floor, 0));
test('فصل بيانات المالك والعمولة عن المستند العام', () => {
  const { pub, priv } = buildDoc({ 'owner.name': 'س', 'financial.debts': 'مديونية', 'location.district': 'الخانكة' });
  assert.equal(priv.owner.name, 'س'); assert.equal(priv.financial.debts, 'مديونية');
  assert.ok(!pub.owner && !pub.financial); assert.equal(pub.location.districtKey, 'الخانكه');
});
test('التحقق من المطلوب والأرقام', () => {
  const e = validate({ price: 'abc', area: '-5' });
  assert.ok(e.propertyType && e.transactionType && e.price && e.area);
  assert.deepEqual(validate({ propertyType: 'x', transactionType: 'sale', price: '1', area: '1' }), {});
});
test('نص المشاركة بلا بيانات سرية', () => {
  const p = { propertyType: 'apartment', transactionType: 'sale', location: { district: 'الخانكة' }, area: 130, floor: 3, rooms: 3, bathrooms: 2, finishing: 'super_lux', facilities: { gas: 'yes', elevator: 'yes' }, price: 950000, owner: { name: 'سري' }, notes: { team: 'سر' } };
  const t = shareText(p);
  assert.match(t, /^شقة للبيع في الخانكة/); assert.match(t, /الدور: الثالث/); assert.match(t, /السعر: 950,000 جنيه/);
  assert.doesNotMatch(t, /سري|سر|مالك/);
});
test('نص المشاركة لا يعرض غير المسجل', () => assert.doesNotMatch(shareText({ propertyType: 'shop', transactionType: 'rent_new' }), /الغرف|الحمامات|السعر/));
test('الفروق بين نسختين', () => assert.deepEqual(diffKeys({ price: 1, a: { b: 2 }, updatedBy: 'x' }, { price: 2, a: { b: 2 }, updatedBy: 'y' }), ['price']));
test('فلاتر القوائم', () => {
  assert.deepEqual(listFilters({}), [['isArchived', '==', false]]);
  assert.deepEqual(listFilters({ archived: true, tx: 'rent' }), [['isArchived', '==', true], ['transactionType', 'in', ['rent_new', 'rent_old']]]);
  assert.deepEqual(listFilters({ status: 'reserved' }), [['status', '==', 'reserved']]);
});
test('الأرشفة حسب الحالة', () => { assert.ok(archiveFor('sold') && archiveFor('suspended') && !archiveFor('available') && !archiveFor('reserved')); });
test('flatten يعامل Timestamp كقيمة', () => assert.deepEqual(Object.keys(flatten({ t: { toMillis() {} }, a: { b: 1 } })), ['t', 'a.b']));
