const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const banks = Array.from({ length: 8 }, (_, index) => {
  const chapter = index + 1;
  const file = `multiple-choice${chapter === 1 ? '' : `-${chapter}`}.js`;
  const source = fs.readFileSync(path.join(__dirname, '../assets/js', file), 'utf8');
  return vm.runInNewContext(`${source}\nMULTIPLE_CHOICE_${chapter};`);
});
const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });
const length = text => [...segmenter.segment(text.replace(/\s/g, ''))].length;

for (const [index, bank] of banks.entries()) {
  test(`chapter ${index + 1}: four distinct choices, valid key, balanced answers`, () => {
    const counts = [0, 0, 0, 0];
    for (const [i, q] of bank.entries()) {
      const label = `chapter ${index + 1} question ${i + 1}`;
      assert.equal(q.options.length, 4, label);
      assert.equal(new Set(q.options).size, 4, label);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, label);
      assert.ok(q.prompt && q.explain, label);
      assert.ok(/[ก-๙]/.test(q.prompt) && /[A-Za-z]/.test(q.prompt), `${label}: bilingual stem`);
      counts[q.answer]++;
      // A unique parenthetical gloss must never identify the correct choice.
      const parentheses = q.options.map(option => (option.match(/\(/g) || []).length);
      assert.equal(new Set(parentheses).size, 1, `${label}: unequal parenthetical structure: ${parentheses}`);
      const lengths = q.options.map(length);
      assert.ok(Math.max(...lengths) <= Math.min(...lengths) * 1.45 + 3,
        `${label}: length spread ${lengths.join('/')}\n${q.options.join('\n')}`);
    }
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join('/'));
    for (let i = 2; i < bank.length; i++) {
      assert.ok(!(bank[i].answer === bank[i - 1].answer && bank[i].answer === bank[i - 2].answer),
        `chapter ${index + 1}: three identical answer positions at question ${i + 1}`);
    }
  });
}

test('whole bank: answer positions differ by at most one', () => {
  const counts = [0, 0, 0, 0];
  banks.flat().forEach(q => counts[q.answer]++);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, counts.join('/'));
  assert.deepEqual(counts, [118, 118, 118, 118], 'perfect global 25% balance');
});

test('questions comprehensively cover all behavioral objectives (at least 2 per objective)', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/chapters.js'), 'utf8');
  const chapters = vm.runInNewContext(`${source}\nCHAPTERS;`);
  assert.equal(banks.length, chapters.length);
  
  let totalObjectives = 0;
  banks.forEach((bank, i) => {
    const numObjectives = chapters[i].questions.length;
    totalObjectives += numObjectives;
    for (let obj = 1; obj <= numObjectives; obj++) {
      const matching = bank.filter(q => q.obj === obj);
      assert.ok(matching.length >= 2, `chapter ${i + 1} objective ${obj} has ${matching.length} questions (expected >= 2)`);
    }
    if (i > 0) {
      bank.forEach(q => {
        assert.ok(Array.isArray(q.sourcePages) && q.sourcePages.length > 0, `chapter ${i + 1} obj ${q.obj} missing sourcePages`);
        assert.ok(q.sourcePages.every(p => Number.isInteger(p) && p > 0), `chapter ${i + 1} invalid sourcePages`);
      });
    }
  });
  assert.equal(totalObjectives, 236);
  assert.equal(banks.flat().length, 472);
});

test('saved positional answers use the revised bank version without deleting old data', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
  const keyDeclaration = source.match(/  const mcqStorageKey = .*;/)[0];
  const loadFunction = source.slice(source.indexOf('  function loadMcq(id)'), source.indexOf('  const mcqStates'));
  const oldState = JSON.stringify({ answers: { 0: 1 }, submitted: false });
  const storage = new Map([['csorg_mcq_chapter1_v1', oldState]]);
  const context = {
    MCQ_BANKS: { 1: banks[0] },
    localStorage: { getItem: key => storage.get(key) ?? null }
  };
  const run = () => vm.runInNewContext(`${keyDeclaration}\n${loadFunction}\nJSON.stringify(loadMcq(1));`, { ...context });
  assert.deepEqual(JSON.parse(run()), { answers: {}, submitted: false });
  assert.equal(storage.get('csorg_mcq_chapter1_v1'), oldState);
  storage.set('csorg_mcq_chapter1_v2', JSON.stringify({ answers: { 0: 2, 1: 9, 2: -1, 3: '1' } }));
  assert.deepEqual(JSON.parse(run()), { answers: { 0: 2 }, submitted: false });
  assert.ok(source.includes('localStorage.setItem(mcqStorageKey(mcqChapter), JSON.stringify(mcq))'));
  assert.ok(source.includes('localStorage.removeItem(mcqStorageKey(id))'));
});

if (process.env.MCQ_AUDIT) {
  banks.forEach((bank, chapter) => bank.forEach((q, i) => {
    const lengths = q.options.map(length);
    const parens = q.options.map(o => (o.match(/\(/g) || []).length);
    if (new Set(parens).size !== 1 || Math.max(...lengths) > Math.min(...lengths) * 1.45 + 3 || !/[A-Za-z]/.test(q.prompt)) {
      console.log(JSON.stringify({ chapter: chapter + 1, question: i + 1, lengths, parens, prompt: q.prompt, options: q.options }));
    }
  }));
}
