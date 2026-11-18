import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePair, matchRequest, matchProperty, splitDistricts, scoreLevel } from '../js/matching-model.js';

const P = (o = {}) => ({ id: 'p1', propertyType: 'apartment', transactionType: 'sale', status: 'available', location: { city: 'الخانكة', cityKey: 'الخانكه', district: 'الحي الأول', districtKey: 'الحي الاول' }, price: 950000, area: 120, rooms: 3, ...o });
const R = (o = {}) => ({ id: 'r1', status: 'new', propertyType: 'apartment', transactionType: 'sale', city: 'الخانكة', cityKey: 'الخانكه', districts: 'الحي الأول', budgetMin: 800000, budgetMax: 1000000, areaMin: 100, areaMax: 140, roomsMin: 3, ...o });

test('تطابق كامل = 100', () => assert.equal(scorePair(R(), P()).score, 100));
test('استبعاد: نوع معاملة مختلف', () => assert.equal(scorePair(R(), P({ transactionType: 'rent_new' })), null));
test('استبعاد: نوع عقار مختلف', () => assert.equal(scorePair(R(), P({ propertyType: 'villa' })), null));
test('استبعاد: عقار غير متاح', () => { for (const s of ['sold', 'reserved', 'rented', 'suspended']) assert.equal(scorePair(R(), P({ status: s })), null, s); });
test('استبعاد: طلب غير نشط', () => { for (const s of ['completed', 'cancelled', 'postponed']) assert.equal(scorePair(R({ status: s }), P()), null, s); });
test('استبعاد: مدينة مختلفة', () => assert.equal(scorePair(R(), P({ location: { city: 'شبرا', cityKey: 'شبرا' } })), null));
test('المدينة بصيغة مختلفة (ة/ه) تتطابق', () => assert.ok(scorePair(R({ cityKey: undefined, city: 'الخانكه' }), P())));
test('منطقة مختلفة بنفس المدينة تخفض الدرجة فقط', () => {
  const m = scorePair(R(), P({ location: { city: 'الخانكة', cityKey: 'الخانكه', district: 'الحي الثاني', districtKey: 'الحي الثاني' } }));
  assert.ok(m.score < 100 && m.score >= 80, String(m.score)); // 12 من 30 في المنطقة → 88
});
test('أكثر من منطقة في الطلب', () => assert.equal(scorePair(R({ districts: 'الحي الثالث، الحي الأول' }), P()).score, 100));
test('تجاوز الميزانية 7.5% = نصف نقاط الميزانية', () => {
  const m = scorePair(R({ budgetMax: 1000000 }), P({ price: 1075000 }));
  assert.equal(m.reasons.find(r => r.key === 'budget').ratio, 0.5);
  assert.equal(m.score, 85);
});
test('تجاوز الميزانية 15% فأكثر = صفر للميزانية', () => assert.equal(scorePair(R(), P({ price: 1200000 })).reasons.find(r => r.key === 'budget').ratio, 0));
test('سعر أقل من الحد الأدنى للميزانية لا يُعاقَب', () => assert.equal(scorePair(R(), P({ price: 500000 })).score, 100));
test('مساحة قريبة تعطي نسبة جزئية', () => { const r = scorePair(R(), P({ area: 90 })).reasons.find(x => x.key === 'area'); assert.ok(r.ratio > 0 && r.ratio < 1); });
test('غرف: أقل بواحدة = نصف النقاط، وأقل بأكثر = صفر', () => {
  assert.equal(scorePair(R(), P({ rooms: 2 })).reasons.find(r => r.key === 'rooms').ratio, 0.5);
  assert.equal(scorePair(R(), P({ rooms: 1 })).reasons.find(r => r.key === 'rooms').ratio, 0);
});
test('قيمة ناقصة في العقار لا تسبب خطأ وتُعلَّم كناقصة', () => {
  const m = scorePair(R(), P({ price: undefined, area: undefined, rooms: undefined }));
  assert.ok(m.score < 50 && m.reasons.filter(r => r.missing).length === 3);
});
test('معيار غير مذكور في الطلب لا يخصم', () => assert.equal(scorePair(R({ budgetMin: undefined, budgetMax: undefined, areaMin: undefined, areaMax: undefined, roomsMin: undefined }), P({ price: undefined })).score, 100));
test('طلب بلا معايير إضافية = مطابقة أساسية', () => { const m = scorePair({ status: 'new', propertyType: 'apartment', transactionType: 'sale' }, P()); assert.equal(m.basicOnly, true); assert.equal(m.score, 50); });
test('الترتيب تنازلي والحد الأدنى يعمل', () => {
  const props = [P({ id: 'a', price: 1075000 }), P({ id: 'b' }), P({ id: 'c', price: 2000000, area: 300, rooms: 1 })];
  const res = matchRequest(R(), props, { minScore: 50 });
  assert.deepEqual(res.map(x => x.item.id), ['b', 'a']);
  assert.ok(res[0].score >= res[1].score);
});
test('مطابقة عقار مع عدة طلبات', () => {
  const res = matchProperty(P(), [R({ id: 'x' }), R({ id: 'y', budgetMax: 900000 }), R({ id: 'z', status: 'cancelled' })]);
  assert.deepEqual(res.map(x => x.item.id), ['x', 'y']);
});
test('تقسيم المناطق ومستويات التوافق', () => { assert.deepEqual(splitDistricts('الحي الأول، الحي الثاني / المنطقة الصناعية'), ['الحي الاول', 'الحي الثاني', 'المنطقه الصناعيه']); assert.equal(scoreLevel(85), 'high'); assert.equal(scoreLevel(65), 'medium'); assert.equal(scoreLevel(40), 'low'); });
