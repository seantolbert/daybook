import test from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeUrl, safeColor, renderMarkdown, splitSections, isoDateInTz, startOfDayInTz, mondayOf, addDays, fmtClock } from '../lib.js';

test('esc escapes HTML-significant characters', () => {
  assert.equal(esc('<img src=x onerror="a">\'`&'), '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&#96;&amp;');
  assert.equal(esc(null), '');
});

test('safeUrl allows only http(s)/mailto', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl(' JavaScript:alert(1)'), '');
  assert.equal(safeUrl('data:text/html,hi'), '');
  assert.equal(safeUrl('https://meet.google.com/abc'), 'https://meet.google.com/abc');
});

test('safeColor rejects CSS injection', () => {
  assert.equal(safeColor('red;background:url(x)'), '#8B7CF6');
  assert.equal(safeColor('#abc'), '#abc');
});

test('renderMarkdown escapes before formatting and whitelists links', () => {
  const html = renderMarkdown('## Hi\n- **bold** <script>x</script>\n[ok](https://a.com/?a=1&b=2) [bad](javascript:alert(1))');
  assert.ok(html.includes('<h4>Hi</h4>'));
  assert.ok(html.includes('<strong>bold</strong> &lt;script&gt;'));
  assert.ok(html.includes('<a href="https://a.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">ok</a>'));
  assert.ok(!html.includes('href="javascript'));
  assert.ok(!/<script/i.test(html));
});

test('renderMarkdown cannot break out of attributes', () => {
  const html = renderMarkdown('[x](https://a.com/"onmouseover="alert(1))');
  assert.ok(!html.includes('" onmouseover') && !html.includes('"onmouseover="'));
});

test('splitSections splits at headings', () => {
  const s = splitSections('## Needs you\n- a\n\n## Already sorted\n- b');
  assert.deepEqual(s.map((x) => x.title), ['Needs you', 'Already sorted']);
});

test('time zone helpers handle DST', () => {
  assert.equal(isoDateInTz(new Date('2026-10-15T03:30:00Z'), 'America/New_York'), '2026-10-14');
  assert.equal(startOfDayInTz('2026-07-01', 'America/New_York').toISOString(), '2026-07-01T04:00:00.000Z');
  assert.equal(startOfDayInTz('2026-12-01', 'America/New_York').toISOString(), '2026-12-01T05:00:00.000Z');
  assert.equal(startOfDayInTz('2026-03-08', 'America/New_York').toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(startOfDayInTz('2026-11-01', 'America/New_York').toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(mondayOf('2026-10-18'), '2026-10-12');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(fmtClock('00:05'), '12:05 AM');
  assert.equal(fmtClock('13:30:00'), '1:30 PM');
});
