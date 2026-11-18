import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFilters, serverPlan, clientMatch, collect, describeFilters } from '../js/search-model.js';

const P = (o = {}) => ({ propertyType: 'apartment', transactionType: 'sale', status: 'available', isArchived: false, location: { city: 'الخانكة', cityKey: 'الخانكه', district: 'الحي الأول' }, price: 950000, area: 120, rooms: 3, bathrooms: 2, floor: 3, facilities: { gas: 'yes', elevator: 'yes' }, ...o });

test('مثال الشقة من المواصفات يطابق', () => {
  const f = cleanFilters({ tx: ['sale'], types: ['apartment'], city: 'الخانكة', priceMin: '700,000', priceMax: '1000000', areaMin: '100', areaMax: '140', rooms: ['3'], bathrooms: ['2'], facilities: ['gas', 'elevator'] });
  assert.ok(clientMatch(P(), f));
  assert.ok(!clientMatch(P({ rooms: 2 }), f)); assert.ok(!clientMatch(P({ price: 1200000 }), f));
  assert.ok(!clientMatch(P({ facilities: { gas: 'unknown', elevator: 'yes' } }), f));
});
test('الحقل غير المسجل لا يطابق الفلتر', () => assert.ok(!clientMatch(P({ rooms: undefined }), cleanFilters({ rooms: ['3'] }))));
test('5+ تعني 5 فأكثر', () => { const f = cleanFilters({ rooms: ['5'] }); assert.ok(clientMatch(P({ rooms: 7 }), f)); assert.ok(!clientMatch(P({ rooms: 4 }), f)); });
test('الدور: أرضي وأخير ومتكرر', () => {
  const top = cleanFilters({ floorFlags: ['top'] });
  assert.ok(clientMatch(P({ floor: 4, buildingDetails: { floors: 5 } }), top)); assert.ok(!clientMatch(P({ floor: 4 }), top));
  assert.ok(clientMatch(P({ floor: 0 }), cleanFilters({ floorFlags: ['ground'] })));
  assert.ok(clientMatch(P({ floor: 2, buildingDetails: { floors: 6 } }), cleanFilters({ floorFlags: ['repeated'] })));
});
test('المؤرشف لا يظهر افتراضيًا ويظهر بفلتر الحالة', () => {
  assert.ok(!clientMatch(P({ status: 'sold', isArchived: true }), {}));
  assert.ok(clientMatch(P({ status: 'sold', isArchived: true }), { status: 'sold' }));
});
test('خطة الخادم: نطاق واحد فقط حسب الترتيب', () => {
  const f = cleanFilters({ tx: ['sale'], city: 'الخانكة', priceMin: '7', priceMax: '9', areaMin: '100' });
  const a = serverPlan(f, 'price_asc');
  assert.deepEqual(a.conds, [['isArchived', '==', false], ['transactionType', '==', 'sale'], ['location.cityKey', '==', 'الخانكه'], ['price', '>=', 7], ['price', '<=', 9]]);
  assert.deepEqual(a.clientKeys, ['areaMin']); assert.ok(!a.exactCount);
  const b = serverPlan(f, 'area_desc');
  assert.ok(b.conds.some(c => c[0] === 'area') && !b.conds.some(c => c[0] === 'price') && b.clientKeys.includes('priceMin'));
});
test('العدّ الدقيق عند غياب فلاتر المتصفح', () => assert.ok(serverPlan(cleanFilters({ tx: ['rent_new'], priceMin: '1' }), 'price_asc').exactCount));
test('أكثر من عملية يُفلتر في المتصفح', () => assert.ok(serverPlan(cleanFilters({ tx: ['sale', 'rent_new'] })).clientKeys.includes('tx')));
test('حلقة التعبئة تتوقف عند العدد المطلوب وتحترم سقف المسح', async () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ data: () => ({ ok: i % 2 === 0 }) }));
  let calls = 0;
  const r = await collect({ fetchPage: async () => { calls++; return { docs: mk(10), cursor: calls }; }, match: p => p.ok, want: 12, pageSize: 10, maxScan: 1000 });
  assert.equal(calls, 3); assert.equal(r.results.length, 15); assert.ok(!r.exhausted);
  const cap = await collect({ fetchPage: async () => ({ docs: mk(10), cursor: 1 }), match: () => false, want: 5, pageSize: 10, maxScan: 30 });
  assert.equal(cap.scanned, 30); assert.equal(cap.results.length, 0);
  const end = await collect({ fetchPage: async () => ({ docs: mk(3) }), match: p => p.ok, pageSize: 10 });
  assert.ok(end.exhausted);
});
test('شرائح الفلاتر النشطة', () => assert.equal(describeFilters(cleanFilters({ priceMin: '700000', priceMax: '1200000' }))[0].label, 'السعر: 700,000 - 1,200,000'));
