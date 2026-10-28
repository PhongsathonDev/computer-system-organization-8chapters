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

test('signal board tracks 236 behavioral objectives across 8 chapters without overflow', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
  const chSource = fs.readFileSync(path.join(__dirname, '../assets/js/chapters.js'), 'utf8');
  const chapters = vm.runInNewContext(`${chSource}\nCHAPTERS;`);
  
  const helperFns = `
    const escapeHtml = (v) => String(v);
    const escapeAttr = (v) => String(v);
    const pad2 = (n) => String(n).padStart(2, '0');
    const TOTAL = CHAPTERS.reduce((sum, ch) => sum + ch.questions.length, 0);
    const MCQ_BANKS = { ${Array.from({ length: 8 }, (_, i) => `${i + 1}: MULTIPLE_CHOICE_${i + 1}`).join(', ')} };
    const MCQ_TOTAL = Object.values(MCQ_BANKS).reduce((sum, q) => sum + q.length, 0);
  `;
  const renderFn = appSource.slice(appSource.indexOf('  function renderMultipleHome() {'), appSource.indexOf('  function renderHome() {'));

  const elements = {};
  const mockDoc = {
    querySelector: (sel) => {
      const id = sel.replace('#', '');
      if (!elements[id]) elements[id] = { innerHTML: '', textContent: '', dataset: {} };
      return elements[id];
    }
  };

  const mcqStates = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, { answers: {}, submitted: false }]));

  const ctx = {
    CHAPTERS: chapters,
    ...Object.fromEntries(banks.map((b, i) => [`MULTIPLE_CHOICE_${i + 1}`, b])),
    mcqStates,
    document: mockDoc,
    $: mockDoc.querySelector
  };

  const runRender = () => vm.runInNewContext(`${helperFns}\n${renderFn}\nrenderMultipleHome();`, { ...ctx });

  // 1. Initial render: 0 answers
  runRender();
  const lanesHtml = elements.multipleLanes.innerHTML;
  const laneButtons = [...lanesHtml.matchAll(/<button class="lane"[\s\S]*?<\/button>/g)];
  assert.equal(laneButtons.length, 8, '8 chapter lanes rendered');
  
  const tickCounts = laneButtons.map((b) => [...b[0].matchAll(/<span class="tick/g)].length);
  const expectedCounts = [21, 28, 41, 27, 21, 34, 48, 16];
  assert.deepEqual(tickCounts, expectedCounts, 'each lane matches chapter behavioral objectives count');
  assert.equal(tickCounts.reduce((s, c) => s + c, 0), 236, 'total signal board ticks equal 236 objectives');
  assert.equal(elements.multipleCorrect.textContent, '0');
  assert.equal(elements.multipleTotal.textContent, '236');
  assert.ok(elements.multipleBoardSub.textContent.includes('236 วัตถุประสงค์'));

  // 2. Answering 1 question of Ch 1 Obj 1 correctly:
  mcqStates[1].answers[0] = banks[0][0].answer;
  runRender();
  assert.equal(elements.multipleCorrect.textContent, '1', '1 objective mastered');
  assert.ok(elements.multipleBoardSub.textContent.includes('ตอบแล้ว 1/472 ข้อ (ถูก 1) · ผ่าน 1/236 วัตถุประสงค์'));

  // 3. Answering 2nd question of Ch 1 Obj 1 incorrectly:
  const q2Obj1Idx = banks[0].findIndex((q, i) => i !== 0 && q.obj === 1);
  mcqStates[1].answers[q2Obj1Idx] = (banks[0][q2Obj1Idx].answer + 1) % 4;
  runRender();
  assert.equal(elements.multipleCorrect.textContent, '0', 'Objective lost when any question is wrong');
  assert.ok(elements.multipleBoardSub.textContent.includes('ตอบแล้ว 2/472 ข้อ (ถูก 1) · ผ่าน 0/236 วัตถุประสงค์'));
  
  // Verify tick classes for Ch 1 Obj 1:
  const currentCh1Lane = [...elements.multipleLanes.innerHTML.matchAll(/<button class="lane"[\s\S]*?<\/button>/g)][0][0];
  assert.ok(currentCh1Lane.includes('<span class="tick is-wrong"></span>'), 'obj 1 tick reflects is-wrong');

  // 4. Answering both questions of Ch 2 Obj 1 correctly:
  const ch2Obj1Indices = banks[1].map((q, i) => ({ q, i })).filter((item) => item.q.obj === 1).map((item) => item.i);
  ch2Obj1Indices.forEach((idx) => {
    mcqStates[2].answers[idx] = banks[1][idx].answer;
  });
  runRender();
  assert.equal(elements.multipleCorrect.textContent, '1', 'Ch 2 obj 1 mastered');
  const currentCh2Lane = [...elements.multipleLanes.innerHTML.matchAll(/<button class="lane"[\s\S]*?<\/button>/g)][1][0];
  assert.ok(currentCh2Lane.includes('<span class="tick is-correct"></span>'), 'Ch 2 obj 1 tick is-correct');

  // 5. Complete all 472 questions correctly across all 8 chapters:
  banks.forEach((b, ci) => {
    const chId = ci + 1;
    mcqStates[chId] = { answers: {}, submitted: true };
    b.forEach((q, qi) => {
      mcqStates[chId].answers[qi] = q.answer;
    });
  });
  runRender();
  assert.equal(elements.multipleCorrect.textContent, '236', 'all 236 objectives mastered when 100% correct');
  assert.equal(elements.multipleTotal.textContent, '236');
  assert.ok(elements.multipleBoardSub.textContent.includes('ตอบแล้ว 472/472 ข้อ (ถูก 472) · ผ่าน 236/236 วัตถุประสงค์'));
  const allLanes = [...elements.multipleLanes.innerHTML.matchAll(/<button class="lane"[\s\S]*?<\/button>/g)];
  const totalCorrectTicks = allLanes.map(b => [...b[0].matchAll(/<span class="tick is-correct"><\/span>/g)].length).reduce((s, c) => s + c, 0);
  assert.equal(totalCorrectTicks, 236, 'all 236 ticks are is-correct');

  // 6. Complete all 472 questions incorrectly:
  banks.forEach((b, ci) => {
    const chId = ci + 1;
    mcqStates[chId] = { answers: {}, submitted: true };
    b.forEach((q, qi) => {
      mcqStates[chId].answers[qi] = (q.answer + 1) % 4;
    });
  });
  runRender();
  assert.equal(elements.multipleCorrect.textContent, '0', '0 objectives mastered when 100% incorrect');
  assert.ok(elements.multipleBoardSub.textContent.includes('ตอบแล้ว 472/472 ข้อ (ถูก 0) · ผ่าน 0/236 วัตถุประสงค์'));
  const allLanesWrong = [...elements.multipleLanes.innerHTML.matchAll(/<button class="lane"[\s\S]*?<\/button>/g)];
  const totalWrongTicks = allLanesWrong.map(b => [...b[0].matchAll(/<span class="tick is-wrong"><\/span>/g)].length).reduce((s, c) => s + c, 0);
  assert.equal(totalWrongTicks, 236, 'all 236 ticks are is-wrong');

  // 7. Reset all chapters back to unattempted:
  banks.forEach((_, ci) => {
    mcqStates[ci + 1] = { answers: {}, submitted: false };
  });
  runRender();
  assert.equal(elements.multipleCorrect.textContent, '0');
  assert.ok(elements.multipleBoardSub.textContent.includes('236 วัตถุประสงค์ · คลัง 472 ข้อทั้ง 8 บท'));
  const totalEmptyTicks = [...elements.multipleLanes.innerHTML.matchAll(/<span class="tick"><\/span>/g)].length;
  assert.equal(totalEmptyTicks, 236, 'all 236 ticks reset to empty');
});

test('static counters and footer synchronize accurately for 472 questions and 236 objectives', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');
  const chSource = fs.readFileSync(path.join(__dirname, '../assets/js/chapters.js'), 'utf8');
  const chapters = vm.runInNewContext(`${chSource}\nCHAPTERS;`);
  const elements = {};
  const mockDoc = {
    getElementById: (id) => {
      if (!elements[id]) elements[id] = { innerHTML: '', textContent: '' };
      return elements[id];
    },
    querySelector: (sel) => mockDoc.getElementById(sel.replace('#', ''))
  };

  const helperFns = `
    const TOTAL = CHAPTERS.reduce((sum, ch) => sum + ch.questions.length, 0);
    const MCQ_BANKS = { ${Array.from({ length: 8 }, (_, i) => `${i + 1}: MULTIPLE_CHOICE_${i + 1}`).join(', ')} };
    const MCQ_TOTAL = Object.values(MCQ_BANKS).reduce((sum, q) => sum + q.length, 0);
  `;
  const staticFn = appSource.slice(appSource.indexOf('  function updateStaticCounts() {'), appSource.indexOf('  function updateTopStats() {'));
  const ctx = {
    CHAPTERS: chapters,
    ...Object.fromEntries(banks.map((b, i) => [`MULTIPLE_CHOICE_${i + 1}`, b])),
    document: mockDoc,
    $: mockDoc.querySelector
  };

  vm.runInNewContext(`${helperFns}\n${staticFn}\nupdateStaticCounts();`, ctx);
  assert.equal(elements.multipleTotal.textContent, '236');
  assert.equal(elements.multipleMetaQuestions.textContent, '472');
  assert.equal(elements.multipleMetaObjectives.textContent, '236');
  assert.equal(elements.multipleFooterTotal.textContent, '472');
  assert.equal(elements.multipleFooterObjectives.textContent, '236');
  assert.equal(elements.boardTotal.textContent, '236');
  assert.equal(elements.footerTotal.textContent, '236');
});

test('CSS rules prevent signal board horizontal overflow across all responsive breakpoints', () => {
  const css = fs.readFileSync(path.join(__dirname, '../assets/css/style.css'), 'utf8');
  assert.ok(css.includes('.signal-board {') && css.includes('min-width: 0;') && css.includes('overflow: hidden;'), 'signal-board contains min-width: 0 and overflow: hidden');
  assert.ok(css.includes('.lane-ticks {') && css.includes('min-width: 0;') && css.includes('overflow: hidden;'), 'lane-ticks contains min-width: 0 and overflow: hidden');
  assert.ok(css.includes('.tick {') && css.includes('flex: 1 1 0;') && css.includes('box-sizing: border-box;'), 'tick has flexible sizing with border-box');
  assert.ok(css.includes('@media (max-width: 620px)'), 'responsive 620px breakpoint present');
  assert.ok(css.includes('@media (max-width: 390px)'), 'responsive 390px breakpoint present');
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
