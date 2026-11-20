import { guard, toast } from './layout.js';
import { buildBackup, runMigration, lastReport } from './services/migration.js';
import { escapeHtml, fmtDateTime } from './utils.js';

const user = await guard({ base: '../', active: 'pages/migration.html', adminOnly: true });
const $ = id => document.getElementById(id);
let backedUp = false, dried = false;
const busy = b => { for (const id of ['backup', 'dry', 'run']) $(id).disabled = b || (id === 'run' && !(backedUp && dried)); $('spin').hidden = !b; };
const show = r => {
  $('report').innerHTML = `<div class="card"><div class="card-body"><h2 class="h6">${r.dryRun ? 'نتيجة التجربة (لم يُكتب شيء)' : 'تقرير الترحيل'}</h2>
  <ul class="mb-2"><li>عقارات فُحصت: <strong>${r.scanned}</strong></li><li>${r.dryRun ? 'ستُرحَّل' : 'رُحِّلت'}: <strong>${r.migrated}</strong></li><li>بلا بيانات سمسار/سعر (وُسمت فقط): ${r.noData}</li>
  <li>سبق ترحيلها (تُركت): ${r.skipped}</li><li>أكواد رقمية ${r.dryRun ? 'ستُسند' : 'أُسندت'}: ${r.codesAssigned}</li><li class="${r.failed ? 'text-danger' : ''}">فشلت: <strong>${r.failed}</strong></li></ul>
  ${r.failures?.length ? `<div class="small text-danger">${r.failures.slice(0, 20).map(f => `<div>${escapeHtml(f.id)}: ${escapeHtml(f.error)}</div>`).join('')}</div>` : ''}</div></div>`;
};
async function showLast() { const l = await lastReport(); $('last').innerHTML = l ? `بواسطة ${escapeHtml(l.lastRunByName || '')} في ${fmtDateTime(l.lastRunAt)} — رُحِّل ${l.migrated}، سبق ${l.skipped}، فشل ${l.failed}` : 'لم يُنفَّذ ترحيل بعد.'; }

$('backup').onclick = async () => {
  busy(true);
  try {
    const data = await buildBackup(n => ($('progress').textContent = `جارٍ التصدير: ${n} عقار`));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `backup-${new Date().toISOString().slice(0, 10)}.json` }); a.click(); URL.revokeObjectURL(url);
    backedUp = true; $('progress').textContent = `تم تنزيل النسخة (${data.properties.length} عقار).`; toast('تم تنزيل النسخة الاحتياطية.', 'success');
  } catch (e) { console.error(e); toast('تعذّر إنشاء النسخة الاحتياطية.', 'danger'); }
  busy(false);
};
const go = dryRun => async () => {
  if (!dryRun && !confirm('سيتم الترحيل الفعلي على البيانات الحالية. هل نزّلت النسخة الاحتياطية؟')) return;
  busy(true);
  try { const r = await runMigration(user, { dryRun, onProgress: r => ($('progress').textContent = `فُحص ${r.scanned} عقار...`) }); show(r); if (dryRun) dried = true; else showLast(); toast(dryRun ? 'انتهت التجربة.' : 'انتهى الترحيل.', r.failed ? 'warning' : 'success'); }
  catch (e) { console.error(e); toast('توقف التنفيذ بسبب خطأ. راجع الصلاحيات والاتصال.', 'danger'); }
  busy(false);
};
$('dry').onclick = go(true); $('run').onclick = go(false);
showLast();
