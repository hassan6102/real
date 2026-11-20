import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDescription as P, parseNumberAt, prepare } from '../js/description-parser.js';

const v = (t, k) => P(t).fields[k]?.value;
const SAMPLE = 'شقة للبيع في الخانكة شارع الجمهورية، مساحة 150 متر، الدور الثالث، 3 غرف وريسبشن قطعتين، حمام ومطبخ، تشطيب سوبر لوكس، السعر مليون و400 ألف، العمارة بها أسانسير، عدادات كهرباء ومياه وغاز، العمارة حديثة.';

test('المثال المرجعي من المواصفات يُستخرج كاملًا', () => {
  const r = P(SAMPLE), f = k => r.fields[k]?.value;
  assert.equal(f('propertyType'), 'apartment'); assert.equal(f('transactionType'), 'sale');
  assert.equal(f('location.district'), 'الخانكة'); assert.equal(f('location.street'), 'الجمهورية');
  assert.equal(f('area'), 150); assert.equal(f('floor'), 3); assert.equal(f('rooms'), 3); assert.equal(f('receptions'), 2);
  assert.equal(f('bathrooms'), 1); assert.equal(f('finishing'), 'super_lux'); assert.equal(f('price'), 1400000);
  assert.equal(f('facilities.elevator'), 'yes');
  for (const k of ['indepElectric', 'indepWater', 'indepGas', 'electricity', 'water', 'gas']) assert.equal(f('facilities.' + k), 'yes');
  assert.deepEqual(r.extra, ['العمارة حديثة']); assert.equal(r.conflicts.length, 0);
});
test('الأرقام العربية الهندية والفواصل', () => {
  const r = P('شقة للبيع في الخانكة شارع الجمهورية، مساحة ١٥٠ متر، الدور الثالث، ٣ غرف، ٢ حمام، السعر ١٬٤٠٠٬٠٠٠ جنيه');
  assert.equal(r.fields.area.value, 150); assert.equal(r.fields.price.value, 1400000); assert.equal(r.fields.rooms.value, 3); assert.equal(r.fields.bathrooms.value, 2);
});
test('أرقام مكتوبة بالكلمات', () => {
  const r = P('للبيع شقة بالخانكة الدور الرابع مساحة مية وخمسين متر ثلاث غرف حمامين السعر مليون وخمسمية ألف');
  assert.equal(r.fields.area.value, 150); assert.equal(r.fields.price.value, 1500000); assert.equal(r.fields.rooms.value, 3); assert.equal(r.fields.bathrooms.value, 2); assert.equal(r.fields.floor.value, 4);
  assert.equal(r.fields['location.district'].value, 'الخانكة');
});
test('كسور المليون وأرقام عشرية', () => {
  assert.equal(v('شقة للبيع السعر مليون ونص', 'price'), 1500000);
  assert.equal(v('شقة للبيع بسعر 2.5 مليون جنيه', 'price'), 2500000);
  assert.equal(v('فيلا للبيع السعر 8 مليون ومئتين الف', 'price'), 8200000);
});
test('السعر لا يلتهم رقم الغرف التالي (950 ألف 3 غرف)', () => {
  const r = P('للبيع شقة 140 متر السعر 950 الف 3 غرف و2 حمام'); assert.equal(r.fields.price.value, 950000); assert.equal(r.fields.rooms.value, 3);
});
test('وصف ناقص: الحقول غير المذكورة تبقى غائبة ولا شيء يُخترع', () => {
  const r = P('شقة للبيع في الخانكة');
  assert.deepEqual(Object.keys(r.fields).sort(), ['location.district', 'propertyType', 'transactionType']);
  for (const k of ['bathrooms', 'rooms', 'price', 'area', 'floor', 'finishing', 'facilities.elevator']) assert.equal(r.fields[k], undefined);
});
test('عدد الحمامات لا يُفترض واحدًا إن لم يُذكر', () => assert.equal(P('شقة للبيع 3 غرف السعر 500 الف').fields.bathrooms, undefined));
test('معلومات متعارضة تُعرض للمراجعة', () => {
  const r = P('شقة للبيع او للايجار في القلج، مساحة 120 والدور الثاني والدور الخامس');
  assert.ok(r.fields.transactionType.conflict && r.fields.transactionType.alternatives.length === 2);
  assert.ok(r.fields.floor.conflict && r.fields.floor.alternatives.includes(2) && r.fields.floor.alternatives.includes(5));
  assert.ok(r.conflicts.includes('floor') && r.warnings.length >= 1);
});
test('إيجار قديم وإيجار جديد وبيع', () => {
  assert.equal(v('محل تجاري للايجار القديم في شارع الجمهورية مساحة 30 متر', 'transactionType'), 'rent_old');
  assert.equal(v('شقة للايجار في العبور إيجار 5000 جنيه شهريا', 'transactionType'), 'rent_new');
  assert.equal(v('شقة للايجار في العبور إيجار 5000 جنيه شهريا', 'price'), 5000);
});
test('مسافة "50 متر من الميدان" ليست مساحة، ومساحة الأرض ليست نوع عقار', () => {
  assert.equal(v('محل تجاري للايجار القديم على بعد 50 متر من الميدان مساحة 30 متر', 'area'), 30);
  const r = P('فيلا للبيع في الخانكة مساحة الارض 400 متر'); assert.equal(r.fields.propertyType.value, 'villa'); assert.equal(r.fields.area.value, 400);
});
test('"مية" (مئة) لا تُفسَّر مياه', () => assert.equal(P('شقة مساحة مية وخمسين متر').fields['facilities.water'], undefined));
test('نفي الأسانسير والجراج', () => { const r = P('فيلا للبيع مفيش اسانسير وفيه جراج'); assert.equal(r.fields['facilities.elevator'].value, 'no'); assert.equal(r.fields['engineering.garage'].value, 'yes'); });
test('الهاتف يُستخرج للعرض ولا يُقرأ سعرًا أو مساحة', () => {
  const r = P('للبيع شقة 140 متر ف الحي الاول السعر 950 الف اتصل ٠١٠١٢٣٤٥٦٧٨ عمولة 2.5%');
  assert.equal(r.offer.brokerPhone, '01012345678'); assert.equal(r.offer.commissionPercent, 2.5); assert.equal(r.fields.price.value, 950000); assert.equal(r.fields.area.value, 140);
});
test('تشطيبات: الأخص أولًا', () => {
  assert.equal(v('شقة تشطيب الترا سوبر لوكس', 'finishing'), 'ultra'); assert.equal(v('شقة تشطيب لوكس', 'finishing'), 'lux');
  assert.equal(v('شقة على الطوب', 'finishing'), 'red_brick'); assert.equal(v('شقة نص تشطيب', 'finishing'), 'semi');
});
test('نص فارغ أو بلا معلومات', () => { assert.equal(P('').found, 0); const r = P('كلام عام مفيش فيه معلومات'); assert.equal(r.found, 0); assert.ok(r.extra.length >= 1); });
test('النص الأصلي محفوظ كاملًا في النتيجة', () => assert.equal(P(SAMPLE).text, SAMPLE));
test('التطبيع يحفظ الأطوال (إزاحات صالحة)', () => { const { src, n } = prepare('أَلشقّة ١٢٣'); assert.equal(src.length, n.length); });
test('parseNumberAt مباشرة', () => {
  const t = s => s.split(' ').map((x, i) => ({ t: x, start: i, end: i + 1, brk: false }));
  assert.equal(parseNumberAt(t('خمسه وعشرين'), 0).value, 25); assert.equal(parseNumberAt(t('مليونين'), 0).value, 2000000);
  assert.equal(parseNumberAt(t('ميتين وخمسين'), 0).value, 250);
});
