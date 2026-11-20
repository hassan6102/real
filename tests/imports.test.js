// فحص ثابت: كل ما تستورده وحدات المتصفح موجود فعلًا في الوحدة المصدر (يلتقط أخطاء الأسماء قبل النشر).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', 'js');
const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.js') ? [join(d, e.name)] : []));
const files = walk(root);
const exportsOf = f => {
  const s = readFileSync(f, 'utf8'), out = new Set();
  for (const m of s.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach(x => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); });
  return out;
};
const FIREBASE = new Set();
{ const s = readFileSync(join(root, 'firebase-config.js'), 'utf8'); for (const m of s.matchAll(/export\s*\{([^}]*)\}/gs)) m[1].split(',').forEach(x => x.trim() && FIREBASE.add(x.trim().split(/\s+as\s+/).pop())); for (const n of exportsOf(join(root, 'firebase-config.js'))) FIREBASE.add(n); }

for (const f of files) {
  test('واردات ' + f.slice(root.length + 1), () => {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      const names = m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean), spec = m[2];
      if (spec.startsWith('http')) continue;
      if (spec.endsWith('firebase-config.js')) { for (const n of names) assert.ok(FIREBASE.has(n), `${n} غير مُصدَّر من firebase-config.js`); continue; }
      const target = resolve(dirname(f), spec), ex = exportsOf(target);
      for (const n of names) assert.ok(ex.has(n), `${n} غير مُصدَّر من ${spec}`);
    }
  });
}
