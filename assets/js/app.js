(() => {
  'use strict';

  const STORAGE_KEY = 'csorg_quiz_v2';
  const VIEW_STORAGE_KEY = 'csorg_current_view_v1';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pad2 = (n) => String(n).padStart(2, '0');
  const CHAPTER_TOTAL = CHAPTERS.length;
  const TOTAL = CHAPTERS.reduce((sum, chapter) => sum + chapter.questions.length, 0);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  /* Chapters that use click-to-choose blanks instead of typed answers. */
  const CHOICE_CHAPTERS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);

  let state = loadState();
  let currentChapter = 1;
  let currentView = 'mode';
  let resetTarget = { type: 'all', chapter: null };
  let lastFocusedInput = null;
  const MCQ_BANKS = { 1: MULTIPLE_CHOICE_1, 2: MULTIPLE_CHOICE_2, 3: MULTIPLE_CHOICE_3, 4: MULTIPLE_CHOICE_4, 5: MULTIPLE_CHOICE_5, 6: MULTIPLE_CHOICE_6, 7: MULTIPLE_CHOICE_7, 8: MULTIPLE_CHOICE_8 };
  const MCQ_TOTAL = Object.values(MCQ_BANKS).reduce((sum, questions) => sum + questions.length, 0);
  let mcqChapter = 1;
  let mcqQuestions = MCQ_BANKS[mcqChapter];
  let mcq = { answers: {}, submitted: false };
  function loadMcq(id) {
    const result = { answers: {}, submitted: false };
    try {
      const saved = JSON.parse(localStorage.getItem(`csorg_mcq_chapter${id}_v1`));
      if (saved && saved.answers && typeof saved.answers === 'object') {
        MCQ_BANKS[id].forEach((q, i) => {
          if (Number.isInteger(saved.answers[i]) && saved.answers[i] >= 0 && saved.answers[i] < 4) result.answers[i] = saved.answers[i];
        });
        result.submitted = Object.keys(result.answers).length === MCQ_BANKS[id].length;
      }
    } catch (_) { /* Storage is optional. */ }
    return result;
  }
  const mcqStates = Object.fromEntries(Object.keys(MCQ_BANKS).map((id) => [id, loadMcq(id)]));
  mcq = mcqStates[1];

  function saveMcq() {
    mcqStates[mcqChapter] = mcq;
    try { localStorage.setItem(`csorg_mcq_chapter${mcqChapter}_v1`, JSON.stringify(mcq)); } catch (_) { /* Storage is optional. */ }
  }

  function updateMcqProgress() {
    const count = Object.keys(mcq.answers).length;
    const score = mcqQuestions.filter((q, i) => mcq.answers[i] === q.answer).length;
    const total = mcqQuestions.length;
    if (mcq.submitted) {
      $('#mcqProgress').textContent = `ผลการทำข้อสอบ: ${score} / ${total} คะแนน (${Math.round(score / total * 100)}%)`;
    } else if (count) {
      $('#mcqProgress').textContent = `ตอบแล้ว ${count} / ${total} ข้อ · ตอบถูก ${score} ข้อ`;
    } else {
      $('#mcqProgress').textContent = `ยังไม่ได้ตอบ · ${total} ข้อ`;
    }
  }

  function mcqQuestionHtml(question, index) {
    const chosen = mcq.answers[index];
    const revealed = chosen !== undefined;
    const correct = revealed && chosen === question.answer;
    const labels = ['ก', 'ข', 'ค', 'ง'];
    const options = question.options.map((option, j) => {
      const classes = ['mcq-option'];
      if (revealed && j === question.answer) classes.push('is-correct');
      else if (revealed && chosen === j) classes.push('is-wrong');
      return `<label class="${classes.join(' ')}"><input type="radio" name="mcq-${index}" value="${j}" ${chosen === j ? 'checked' : ''}${revealed ? ' disabled' : ''}><span>${labels[j]}. ${escapeHtml(option)}</span></label>`;
    }).join('');
    const feedback = revealed
      ? `<div class="mcq-feedback" role="status" tabindex="-1"><strong>${correct ? 'ตอบถูก' : 'ตอบผิด'} · เฉลย ${labels[question.answer]}</strong><p>${escapeHtml(question.explain)}</p>${question.sourcePages ? `<p class="mcq-objective">อ้างอิงใบเนื้อหาบทที่ ${mcqChapter} หน้า ${question.sourcePages.join(', ')}</p>` : ''}</div>`
      : '';
    return `<fieldset class="mcq-question${revealed ? ' is-answered' : ''}" id="mcq-${index}"><legend>ข้อ ${index + 1} · วัตถุประสงค์ ${index + 1}</legend><p class="mcq-objective">${escapeHtml(CHAPTERS[mcqChapter - 1].questions[index].objective)}</p><h3>${escapeHtml(question.prompt)}</h3><div class="mcq-options">${options}</div>${feedback}</fieldset>`;
  }

  function renderMcq() {
    $('#mcqTitle').textContent = CHAPTERS[mcqChapter - 1].title;
    $('#mcqKicker').textContent = `บทที่ ${pad2(mcqChapter)} / 08 · 4 ตัวเลือก`;
    $('#mcqDesc').textContent = `${mcqQuestions.length} ข้อ ครบ ${mcqQuestions.length} วัตถุประสงค์ · เลือกคำตอบแล้วเห็นเฉลยทันที`;
    $('#mcqQuestions').innerHTML = mcqQuestions.map((q, i) => mcqQuestionHtml(q, i)).join('');
    $('#mcqRetry').hidden = Object.keys(mcq.answers).length === 0;
    $('#mcqError').textContent = '';
    updateMcqProgress();
  }

  /* Add stable IDs and a shuffled word bank to every chapter. */
  CHAPTERS.forEach((chapter) => {
    chapter.questions.forEach((question, index) => {
      question.id = `${chapter.id}-${index + 1}`;
      question.number = index + 1;
    });
    const answers = chapter.questions.map((question) => question.answer);
    chapter.bank = seededShuffle(answers, chapter.id * 97 + 13);
  });

  function seededShuffle(items, seed) {
    const result = [...items];
    let value = seed >>> 0;
    for (let i = result.length - 1; i > 0; i -= 1) {
      value = (value * 1664525 + 1013904223) >>> 0;
      const j = value % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function emptyState() {
    return { answers: {}, drafts: {}, hints: {}, lastChapter: 1 };
  }

  function loadState() {
    const empty = emptyState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return empty;
      const parsed = JSON.parse(raw);
      return {
        answers: parsed && typeof parsed.answers === 'object' && parsed.answers ? parsed.answers : {},
        drafts: parsed && typeof parsed.drafts === 'object' && parsed.drafts ? parsed.drafts : {},
        hints: parsed && typeof parsed.hints === 'object' && parsed.hints ? parsed.hints : {},
        lastChapter: Number(parsed && parsed.lastChapter) || 1
      };
    } catch (error) {
      return empty;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* The quiz still works when storage is unavailable. */
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function normalize(value) {
    const thaiDigits = { '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4', '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9' };
    return String(value)
      .toLowerCase()
      .replace(/[๐-๙]/g, (digit) => thaiDigits[digit])
      .replace(/[₀-₉]/g, '')
      .replace(/[’‘`]/g, '')
      .replace(/[\s\u00A0\u200B\-–—_.,()[\]{}:;'"“”\/\\+=|]/g, '')
      .trim();
  }

  function isCorrect(value, question) {
    const normalized = normalize(value);
    if (!normalized) return false;
    return [question.answer, ...(question.accept || [])].some((candidate) => normalize(candidate) === normalized);
  }

  function questionValue(question) {
    const answer = state.answers[question.id];
    if (answer) return answer.value;
    return state.drafts[question.id] || '';
  }

  function chapterById(id) {
    return CHAPTERS.find((chapter) => chapter.id === Number(id));
  }

  function isChoiceChapter(chapter) {
    return Boolean(chapter) && CHOICE_CHAPTERS.has(chapter.id);
  }

  function chapterStats(chapter) {
    let checked = 0;
    let correct = 0;
    let wrong = 0;
    chapter.questions.forEach((question) => {
      const answer = state.answers[question.id];
      if (answer && answer.checked) {
        checked += 1;
        if (answer.correct) correct += 1;
        else wrong += 1;
      }
    });
    return {
      checked,
      correct,
      wrong,
      unanswered: chapter.questions.length - checked,
      total: chapter.questions.length
    };
  }

  function filledStats(chapter) {
    let filled = 0;
    chapter.questions.forEach((question) => {
      if (questionValue(question).trim()) filled += 1;
    });
    return { filled, total: chapter.questions.length };
  }

  function overallStats() {
    return CHAPTERS.reduce((result, chapter) => {
      const stats = chapterStats(chapter);
      result.checked += stats.checked;
      result.correct += stats.correct;
      result.wrong += stats.wrong;
      return result;
    }, { checked: 0, correct: 0, wrong: 0 });
  }

  function updateStaticCounts() {
    const fields = {
      topTotal: TOTAL,
      boardTotal: TOTAL,
      heroQuestions: TOTAL,
      heroHints: TOTAL,
      footerTotal: TOTAL
    };
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
    const boardSub = $('#boardSub');
    if (boardSub) boardSub.textContent = `${TOTAL} ข้อ · ครบทุกวัตถุประสงค์`;
  }

  function updateTopStats() {
    const stats = overallStats();
    const topAnswered = $('#topAnswered');
    if (topAnswered) topAnswered.textContent = String(stats.checked);
    const boardCorrect = $('#boardCorrect');
    if (boardCorrect && currentView === 'home') boardCorrect.textContent = String(stats.correct);
  }

  function scrollPageTop() {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }

  function focusHeading(element) {
    if (!element) return;
    element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
  }

  function setView(name) {
    currentView = name;
    try {
      sessionStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view: name, chapter: name === 'mcq' ? mcqChapter : currentChapter }));
    } catch (_) { /* Navigation still works when storage is unavailable. */ }
    document.body.classList.toggle('choosing-mode', name === 'mode');
    document.body.classList.toggle('viewing-multiple', name === 'multiple' || name === 'mcq');
    closeAnswerPicker(false);
    $('#modeView').hidden = name !== 'mode';
    $('#multipleView').hidden = name !== 'multiple';
    $('#multipleQuizView').hidden = name !== 'mcq';
    $('#homeView').hidden = name !== 'home';
    $('#quizView').hidden = name !== 'quiz';
    $('#summaryView').hidden = name !== 'summary';
    syncSubmitDock();
    updateTopStats();
  }

  function syncSubmitDock() {
    const dock = $('#submitDock');
    if (!dock) return;
    const chapter = chapterById(currentChapter);
    const complete = chapter ? chapterStats(chapter).checked === chapter.questions.length : false;
    dock.hidden = currentView !== 'quiz' || complete;
  }

  function showHome() {
    setView('home');
    renderHome();
    document.title = 'CS:ORG — แล็บเติมคำ โครงสร้างระบบคอมพิวเตอร์';
    scrollPageTop();
    focusHeading($('#homeTitle'));
  }

  function openChapter(id, focusIndex = null) {
    const chapter = chapterById(id);
    if (!chapter) return;
    currentChapter = chapter.id;
    state.lastChapter = chapter.id;
    saveState();
    setView('quiz');
    renderQuiz();
    document.title = `บทที่ ${pad2(chapter.id)} — ${chapter.title} | CS:ORG`;
    scrollPageTop();
    focusHeading($('#quizTitle'));
    if (Number.isInteger(focusIndex)) {
      const safeIndex = Math.max(0, Math.min(chapter.questions.length - 1, focusIndex));
      window.requestAnimationFrame(() => {
        focusQuestion(chapter.questions[safeIndex], { scroll: true });
      });
    }
  }

  function showSummary(id) {
    const chapter = chapterById(id);
    if (!chapter) return;
    currentChapter = chapter.id;
    setView('summary');
    renderSummary();
    document.title = `ผลบทที่ ${pad2(chapter.id)} — ${chapter.title} | CS:ORG`;
    scrollPageTop();
    focusHeading($('#summaryTitle'));
  }

  function continueTraining() {
    const firstIncomplete = CHAPTERS.find((chapter) => chapterStats(chapter).checked < chapter.questions.length);
    if (firstIncomplete) openChapter(firstIncomplete.id);
    else openChapter(1, 0);
  }

  /* ---------- Home ---------- */
  function renderMultipleHome() {
    const correct = Object.entries(MCQ_BANKS).reduce((sum, [id, questions]) => sum + questions.filter((q, i) => mcqStates[id].answers[i] === q.answer).length, 0);
    $('#multipleCorrect').textContent = correct;
    const nextId = Number(Object.keys(MCQ_BANKS).find((id) => !mcqStates[id].submitted) || 1);
    $('#multipleContinue').dataset.mcqChapter = nextId;
    $('#multipleContinue').textContent = `${mcqStates[nextId].submitted ? 'ดูผล' : Object.keys(mcqStates[nextId].answers).length ? 'ฝึกต่อ' : 'เริ่ม'}บทที่ ${nextId}`;
    $('#multipleLanes').innerHTML = CHAPTERS.map((chapter) => {
      const questions = MCQ_BANKS[chapter.id];
      const available = Boolean(questions);
      const chapterState = mcqStates[chapter.id];
      const ticks = available ? questions.map((q, i) => `<span class="tick${chapterState.answers[i] === undefined ? '' : chapterState.answers[i] === q.answer ? ' is-correct' : ' is-wrong'}"></span>`).join('') : '<span class="lane-pending">กำลังเตรียมข้อสอบ</span>';
      return `<button class="lane" type="button" ${available ? `data-action="open-mcq" data-mcq-chapter="${chapter.id}"` : 'disabled'} aria-label="บทที่ ${chapter.id} ${escapeAttr(chapter.title)} ${available ? `${questions.length} ข้อ` : 'กำลังเตรียมข้อสอบ'}"><span class="lane-label"><span class="lane-no">${pad2(chapter.id)}</span><span class="lane-name">${escapeHtml(chapter.short)}</span></span><span class="lane-ticks">${ticks}</span></button>`;
    }).join('');
    $('#multipleChapters').innerHTML = CHAPTERS.map((chapter) => {
      const available = Boolean(MCQ_BANKS[chapter.id]);
      const mcq = mcqStates[chapter.id];
      const total = available ? MCQ_BANKS[chapter.id].length : 0;
      const filled = available ? Object.keys(mcq.answers).length : 0;
      const progressLabel = available ? mcq.submitted ? 'ครบแล้ว' : filled ? 'ตอบแล้ว' : 'ยังไม่เริ่ม' : 'ยังไม่เปิด';
      const action = available ? mcq.submitted ? 'ดูผล' : filled ? 'ทำต่อ' : 'เข้าบท' : 'กำลังเตรียม';
      return `<button class="chapter-row" type="button" ${available ? `data-action="open-mcq" data-mcq-chapter="${chapter.id}"` : 'disabled'}><span class="chapter-no">${pad2(chapter.id)}</span><span class="chapter-main"><span class="chapter-title">${escapeHtml(chapter.title)}</span><span class="chapter-sub">${escapeHtml(chapter.desc)}</span></span><span class="chapter-progress"><span class="progress-copy"><span>${progressLabel}</span><b>${available ? `${filled}/${total}` : '—'}</b></span><span class="progress-track"><span class="progress-fill" style="width:${available ? filled / total * 100 : 0}%"></span></span></span><span class="row-action${available && mcq.submitted ? ' is-done' : ''}">${action}</span></button>`;
    }).join('');
  }

  function renderHome() {
    const overall = overallStats();
    const boardCorrect = $('#boardCorrect');
    if (boardCorrect) boardCorrect.textContent = String(overall.correct);

    $('#boardLanes').innerHTML = CHAPTERS.map((chapter) => {
      const stats = chapterStats(chapter);
      const ticks = chapter.questions.map((question) => {
        const answer = state.answers[question.id];
        const tickClass = answer ? (answer.correct ? ' is-correct' : ' is-wrong') : '';
        return `<span class="tick${tickClass}"></span>`;
      }).join('');
      return `
        <button class="lane" type="button" data-chapter="${chapter.id}" aria-label="${pad2(chapter.id)} ${escapeAttr(chapter.short)} — บทที่ ${chapter.id} ${escapeAttr(chapter.title)} ทำแล้ว ${stats.checked} จาก ${stats.total} ข้อ">
          <span class="lane-label">
            <span class="lane-no">${pad2(chapter.id)}</span>
            <span class="lane-name">${escapeHtml(chapter.short)}</span>
          </span>
          <span class="lane-ticks" aria-hidden="true">${ticks}</span>
        </button>
      `;
    }).join('');

    $('#chapterList').innerHTML = CHAPTERS.map((chapter) => {
      const stats = chapterStats(chapter);
      const complete = stats.checked === chapter.questions.length;
      const started = stats.checked > 0;
      const actionLabel = complete ? 'ดูผล' : started ? 'ทำต่อ' : 'เข้าบท';
      const progressLabel = complete ? 'ครบแล้ว' : started ? 'ทำแล้ว' : 'ยังไม่เริ่ม';
      const progress = Math.round((stats.checked / chapter.questions.length) * 100);
      return `
        <button class="chapter-row" type="button" data-chapter="${chapter.id}">
          <span class="chapter-no">${pad2(chapter.id)}</span>
          <span class="chapter-main">
            <span class="chapter-title">${escapeHtml(chapter.title)}</span>
            <span class="chapter-sub">${escapeHtml(chapter.desc)}</span>
          </span>
          <span class="chapter-progress">
            <span class="progress-copy"><span>${progressLabel}</span><b>${stats.checked}/${chapter.questions.length}</b></span>
            <span class="progress-track"><span class="progress-fill" style="width:${progress}%"></span></span>
          </span>
          <span class="row-action${complete ? ' is-done' : ''}">${actionLabel}</span>
        </button>
      `;
    }).join('');

    const continueBtn = $('#continueBtn');
    if (continueBtn) {
      const next = CHAPTERS.find((chapter) => chapterStats(chapter).checked < chapter.questions.length);
      if (!next) continueBtn.textContent = 'ทบทวนบทที่ 1';
      else if (overall.checked > 0) continueBtn.textContent = `ฝึกต่อบทที่ ${next.id}`;
      else continueBtn.textContent = 'เริ่มบทที่ 1';
    }
    updateTopStats();
  }

  /* ---------- Quiz ---------- */
  function renderChapterTabs() {
    $('#chapterTabs').innerHTML = CHAPTERS.map((chapter) => {
      const stats = chapterStats(chapter);
      const complete = stats.checked === chapter.questions.length;
      const current = chapter.id === currentChapter;
      const classes = ['chapter-tab'];
      if (complete) classes.push('is-complete');
      if (current) classes.push('is-current');
      return `<button class="${classes.join(' ')}" type="button" data-chapter="${chapter.id}" aria-label="${pad2(chapter.id)} — บทที่ ${chapter.id} ${escapeAttr(chapter.title)}"${current ? ' aria-current="page"' : ''}>${pad2(chapter.id)}</button>`;
    }).join('');
  }

  function renderQuestionRail(chapter) {
    $('#questionRail').innerHTML = chapter.questions.map((question) => {
      const answer = state.answers[question.id];
      const draft = state.drafts[question.id] || '';
      const classes = ['ws-nav-btn'];
      let status = 'ยังไม่ตอบ';
      if (answer) {
        classes.push(answer.correct ? 'is-correct' : 'is-wrong');
        status = answer.correct ? 'ตอบถูก' : 'ตอบผิด';
      } else if (draft.trim()) {
        classes.push('is-filled');
        status = 'กรอกแล้ว';
      }
      return `<button class="${classes.join(' ')}" type="button" data-qid="${question.id}" aria-label="ไปข้อ ${pad2(question.number)} ${status}">${pad2(question.number)}</button>`;
    }).join('');
  }

  function statusMeta(answer) {
    if (!answer) return { label: 'ยังไม่ตอบ', className: '' };
    return answer.correct
      ? { label: 'ตอบถูก', className: 'is-correct' }
      : { label: 'ตอบผิด', className: 'is-wrong' };
  }

  function inputWidthFor(value) {
    const length = Math.max(String(value || '').length, 6);
    return Math.min(520, Math.max(132, Math.round(length * 16 + 38)));
  }

  function buildPrompt(question, answer, draft, chapter) {
    const parts = question.prompt.split('{{blank}}');
    const before = escapeHtml(parts[0] || '');
    const after = escapeHtml(parts.slice(1).join('{{blank}}') || '');
    const value = answer ? answer.value : draft;
    const stateClass = answer ? (answer.correct ? ' is-correct' : ' is-wrong') : '';
    let field;
    if (answer) {
      field = `<span class="answer-value${stateClass}">${escapeHtml(value)}</span>`;
    } else if (isChoiceChapter(chapter)) {
      const filled = Boolean(String(draft || '').trim());
      field = `<button
          id="answer-${question.id}"
          class="answer-choice${filled ? ' is-filled' : ''}"
          type="button"
          data-qid="${question.id}"
          data-blank
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="answerPicker"
          aria-label="คำตอบข้อ ${pad2(question.number)}${filled ? `: ${escapeAttr(draft)}` : ' ยังไม่ได้เลือก'}"
          aria-describedby="obj-${question.id} hint-${question.id}"
        ><span class="answer-choice-value${filled ? '' : ' is-empty'}">${filled ? escapeHtml(draft) : 'กดเลือกคำ'}</span><span class="answer-choice-caret" aria-hidden="true"></span></button>`;
    } else {
      field = `<input
          id="answer-${question.id}"
          class="answer-input"
          type="text"
          data-qid="${question.id}"
          value="${escapeAttr(value)}"
          placeholder="เติมคำตอบ…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="next"
          aria-label="คำตอบข้อ ${pad2(question.number)}"
          aria-describedby="obj-${question.id} hint-${question.id}"
          style="width:${inputWidthFor(value)}px"
        >`;
    }
    return `${before}<span class="blank-wrap">${field}</span>${after}`;
  }

  function renderHint(question) {
    const open = Boolean(state.hints[question.id]);
    return `
      <button class="hint-toggle" type="button" data-action="toggle-hint" data-qid="${question.id}" aria-expanded="${open}" aria-controls="hint-${question.id}">${open ? 'ซ่อนคำใบ' : 'ดูคำใบ'}</button>
      <div class="hint-box" id="hint-${question.id}"${open ? '' : ' hidden'}>
        <strong>คำใบจากบทเรียน</strong>${escapeHtml(question.example)}
      </div>
    `;
  }

  function renderFeedback(question, answer) {
    if (!answer) return '';
    const correct = answer.correct;
    return `
      <div class="feedback ${correct ? 'is-correct' : 'is-wrong'}" role="status">
        <span class="feedback-icon" aria-hidden="true">${correct ? '✓' : '×'}</span>
        <div class="feedback-body">
          <p class="feedback-title">${correct ? 'ตอบถูก' : 'ยังไม่ถูก'}</p>
          <p class="feedback-answer">คำตอบที่ถูก: <b>${escapeHtml(question.answer)}</b>${!correct && answer.value ? ` · คำตอบของคุณ: ${escapeHtml(answer.value)}` : ''}</p>
          <p class="feedback-explain">${escapeHtml(question.explain)}</p>
        </div>
      </div>
    `;
  }

  /* ---------- Click-to-choose picker ---------- */
  let pickerOwner = null;
  let pickerQuestionId = null;

  function pickerNode() {
    let picker = document.getElementById('answerPicker');
    if (picker) return picker;
    picker = document.createElement('div');
    picker.id = 'answerPicker';
    picker.className = 'answer-picker';
    picker.hidden = true;
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'เลือกคำตอบ');
    picker.innerHTML = `
      <div class="answer-picker-head">
        <span class="answer-picker-title">เลือกคำตอบ</span>
        <span class="answer-picker-meta" id="answerPickerNote"></span>
        <button class="answer-picker-close" type="button" data-picker-close aria-label="ปิดรายการคำตอบ">×</button>
      </div>
      <div class="answer-picker-list" id="answerPickerList" role="group" aria-label="ตัวเลือกคำตอบ"></div>
      <div class="answer-picker-foot">
        <span class="answer-picker-tip">เลือกคำแล้วช่องจะถูกเติมทันที</span>
        <button class="answer-picker-clear" type="button" data-picker-clear>ล้างคำตอบ</button>
      </div>
    `;
    document.body.appendChild(picker);
    return picker;
  }

  function positionAnswerPicker(owner) {
    const picker = pickerNode();
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const sheet = viewportWidth < 640;
    picker.classList.toggle('is-sheet', sheet);
    if (sheet) {
      picker.style.left = '';
      picker.style.top = '';
      picker.style.right = '';
      picker.style.bottom = '';
      picker.style.width = '';
      return;
    }
    const margin = 10;
    const gap = 8;
    const rect = owner.getBoundingClientRect();
    const width = Math.min(440, viewportWidth - margin * 2);
    picker.style.width = `${width}px`;
    const height = picker.offsetHeight || 320;
    const left = Math.min(Math.max(margin, rect.left), viewportWidth - width - margin);
    let top = rect.bottom + gap;
    if (top + height > viewportHeight - margin) {
      const above = rect.top - height - gap;
      top = above > margin ? above : Math.max(margin, viewportHeight - height - margin);
    }
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
    picker.style.right = 'auto';
    picker.style.bottom = 'auto';
  }

  function openAnswerPicker(owner) {
    const chapter = chapterById(currentChapter);
    const question = chapter.questions.find((item) => item.id === owner.dataset.qid);
    if (!question) return;
    pickerOwner = owner;
    pickerQuestionId = question.id;

    const picker = pickerNode();
    const selected = normalize(state.drafts[question.id] || '');
    const usedElsewhere = new Set(
      chapter.questions
        .filter((item) => item.id !== question.id)
        .map((item) => normalize(questionValue(item)))
        .filter(Boolean)
    );
    const usedNow = usedWords(chapter);
    const usedCount = chapter.bank.filter((word) => usedNow.has(normalize(word))).length;
    $('#answerPickerNote', picker).textContent = `ใช้แล้ว ${usedCount} / ${chapter.bank.length} คำ`;
    $('#answerPickerList', picker).innerHTML = chapter.bank.map((option, index) => {
      const isSelected = Boolean(selected) && normalize(option) === selected;
      const isUsed = usedElsewhere.has(normalize(option));
      const unavailable = isUsed && !isSelected;
      return `<button class="answer-option${isSelected ? ' is-selected' : ''}${unavailable ? ' is-used' : ''}" type="button" data-answer="${escapeAttr(option)}" aria-pressed="${isSelected}"${unavailable ? ' disabled title="คำนี้ถูกใช้ในข้ออื่นแล้ว"' : ''}>
        <span class="answer-option-no" aria-hidden="true">${pad2(index + 1)}</span>
        <span class="answer-option-text">${escapeHtml(option)}</span>
        <span class="answer-option-flag">${unavailable ? 'ใช้แล้ว' : ''}</span>
        <span class="answer-option-check" aria-hidden="true">✓</span>
      </button>`;
    }).join('');
    picker.hidden = false;
    owner.setAttribute('aria-expanded', 'true');
    owner.classList.add('is-open');
    positionAnswerPicker(owner);
    const target = $('.answer-option.is-selected', picker) || $('.answer-option:not(:disabled)', picker) || $('.answer-option', picker);
    if (target) target.focus({ preventScroll: true });
  }

  function closeAnswerPicker(returnFocus = false) {
    const picker = document.getElementById('answerPicker');
    const owner = pickerOwner;
    if (picker && !picker.hidden) {
      picker.hidden = true;
      picker.classList.remove('is-sheet');
    }
    if (owner) {
      owner.setAttribute('aria-expanded', 'false');
      owner.classList.remove('is-open');
      if (returnFocus && document.contains(owner)) owner.focus({ preventScroll: true });
    }
    pickerOwner = null;
    pickerQuestionId = null;
  }

  function updateBlankUI(question) {
    const button = document.getElementById(`answer-${question.id}`);
    if (!button || !button.hasAttribute('data-blank')) return;
    const value = state.drafts[question.id] || '';
    const label = $('.answer-choice-value', button);
    if (label) {
      label.textContent = value || 'กดเลือกคำ';
      label.classList.toggle('is-empty', !value);
    }
    button.classList.toggle('is-filled', Boolean(value));
    button.setAttribute('aria-label', `คำตอบข้อ ${pad2(question.number)}${value ? `: ${value}` : ' ยังไม่ได้เลือก'}`);
  }

  function chooseAnswer(questionId, value) {
    const chapter = chapterById(currentChapter);
    const question = chapter.questions.find((item) => item.id === questionId);
    const owner = pickerOwner;
    if (!question) return;
    if (value && isUsedElsewhere(chapter, question.id, value)) return;
    if (value) state.drafts[question.id] = value;
    else delete state.drafts[question.id];
    saveState();
    updateBlankUI(question);
    clearMissingState(question.id);
    updateProgressUI();
    closeAnswerPicker(false);
    if (owner && document.contains(owner)) owner.focus({ preventScroll: true });
  }

  function clearMissingState(questionId) {
    const item = document.getElementById(`q-${questionId}`);
    if (item) {
      item.classList.remove('is-missing');
      const note = $('.missing-note', item);
      if (note) note.remove();
    }
    const field = document.getElementById(`answer-${questionId}`);
    if (field) field.removeAttribute('aria-invalid');
  }

  function renderItem(chapter, question) {
    const answer = state.answers[question.id] || null;
    const draft = state.drafts[question.id] || '';
    const filled = Boolean(answer || draft.trim());
    const meta = answer ? statusMeta(answer) : { label: filled ? 'กรอกแล้ว' : 'ยังไม่ตอบ', className: filled ? 'is-filled' : '' };
    return `
      <article class="ws-item" id="q-${question.id}" data-qid="${question.id}">
        <div class="ws-item-head">
          <span class="ws-no">ข้อ ${pad2(question.number)} <span>/ ${chapter.questions.length}</span></span>
          <span class="ws-obj-label">วัตถุประสงค์ ${pad2(question.obj)}</span>
          <span class="ws-status${meta.className ? ` ${meta.className}` : ''}" data-role="status">${meta.label}</span>
        </div>
        <div class="ws-body">
          <p class="ws-objective" id="obj-${question.id}">${escapeHtml(question.objective)}</p>
          <p class="ws-prompt">${buildPrompt(question, answer, draft, chapter)}</p>
          <div class="ws-support">${renderHint(question)}</div>
          <div class="ws-feedback" data-role="feedback">${renderFeedback(question, answer)}</div>
        </div>
      </article>
    `;
  }

  function renderWordBank(chapter, complete) {
    return chapter.bank.map((chipAnswer) => {
      return `<button class="word-chip" type="button" data-answer="${escapeAttr(chipAnswer)}"${complete ? ' disabled' : ''}>${escapeHtml(chipAnswer)}</button>`;
    }).join('');
  }

  function usedWords(chapter) {
    const used = new Set();
    chapter.questions.forEach((question) => {
      const value = normalize(questionValue(question));
      if (value) used.add(value);
    });
    return used;
  }

  function isUsedElsewhere(chapter, questionId, value) {
    const target = normalize(value);
    if (!target) return false;
    return chapter.questions.some((question) => question.id !== questionId
      && normalize(questionValue(question)) === target);
  }

  function renderChoiceBank(chapter) {
    const used = usedWords(chapter);
    return chapter.bank.map((word) => {
      const inUse = used.has(normalize(word));
      return `<span class="word-chip is-static${inUse ? ' is-used' : ''}"${inUse ? ' title="ใช้แล้ว"' : ''}>${escapeHtml(word)}${inUse ? '<span class="sr-only"> (ใช้แล้ว)</span>' : ''}</span>`;
    }).join('');
  }

  function syncChoiceBank(chapter) {
    const used = usedWords(chapter);
    const count = chapter.bank.filter((word) => used.has(normalize(word))).length;
    $('#bankTitle').textContent = 'คำทั้งหมดในบท';
    $('#bankCount').textContent = `ใช้แล้ว ${count} / ${chapter.bank.length}`;
    $('#bankNote').hidden = false;
    $('#wordBank').innerHTML = renderChoiceBank(chapter);
  }

  function renderQuiz() {
    const chapter = chapterById(currentChapter);
    const stats = chapterStats(chapter);
    const filled = filledStats(chapter).filled;
    const complete = stats.checked === chapter.questions.length;
    const choice = isChoiceChapter(chapter);

    renderChapterTabs();
    renderQuestionRail(chapter);

    $('#quizKicker').innerHTML = `บทที่ ${pad2(chapter.id)} / ${pad2(CHAPTER_TOTAL)} <span class="accent">· ${chapter.questions.length} ข้อ</span>`;
    $('#quizTitle').textContent = chapter.title;
    $('#quizDesc').textContent = `${chapter.desc} · ครบ ${chapter.questions.length} วัตถุประสงค์`;
    $('#metricAnswered').textContent = `${filled} / ${chapter.questions.length}`;
    $('#metricStatus').textContent = complete ? 'ส่งแล้ว' : 'กำลังทำ';
    $('#summaryBtn').hidden = !complete;
    $('#worksheetCount').textContent = `${chapter.questions.length} ข้อ · ${chapter.questions.length} วัตถุประสงค์`;

    $('#asideAnswered').textContent = String(filled);
    $('#asideTotal').textContent = `/ ${chapter.questions.length} ข้อ`;
    $('#asideFill').style.width = `${Math.round((filled / chapter.questions.length) * 100)}%`;

    $('#quizView').classList.toggle('is-choice-mode', choice);
    const bankPanel = $('#bankPanel');
    bankPanel.hidden = false;
    bankPanel.open = choice;
    $('#worksheetInstructions').innerHTML = choice
      ? '<strong>กดช่องว่างในประโยคแล้วเลือกคำ</strong> ให้ครบทุกข้อ เลือกได้คำละครั้ง คำที่ใช้แล้วจะถูกขีดฆ่า<br>กด “ดูคำใบ” เมื่อต้องการตัวอย่างจากบทเรียน คำใบไม่ใช่คำตอบโดยตรง'
      : '<strong>เติมคำให้ครบทุกข้อ</strong> แล้วกดส่งคำตอบครั้งเดียว ระบบจะตรวจทั้งบทพร้อมกัน<br>กด “ดูคำใบ” เมื่อต้องการตัวอย่างจากบทเรียน คำใบไม่ใช่คำตอบโดยตรง';
    $('#asideHelp').textContent = choice
      ? 'คลิกหมายเลขเพื่อไปยังข้อนั้น · คลิกช่องว่างเพื่อเลือกคำ'
      : 'คลิกหมายเลขเพื่อกระโดดไปยังข้อนั้น';

    if (choice) {
      syncChoiceBank(chapter);
    } else {
      $('#bankTitle').textContent = 'คลังคำช่วยตอบ';
      $('#bankCount').textContent = `${chapter.bank.length} คำ`;
      $('#bankNote').hidden = true;
      $('#wordBank').innerHTML = renderWordBank(chapter, complete);
    }
    $('#questionList').innerHTML = chapter.questions.map((question) => renderItem(chapter, question)).join('');

    updateDock(chapter, filled);
    $('#submitError').textContent = '';
    syncSubmitDock();
    $$('.answer-input', $('#questionList')).forEach((input) => resizeInput(input));
    lastFocusedInput = null;
  }

  function updateDock(chapter, filled) {
    $('#dockAnswered').textContent = String(filled);
    $('#dockTotal').textContent = String(chapter.questions.length);
    $('#dockFill').style.width = `${Math.round((filled / chapter.questions.length) * 100)}%`;
    $('#dockNote').textContent = filled === chapter.questions.length
      ? 'ครบทุกข้อแล้ว พร้อมส่งคำตอบ'
      : `เหลือ ${chapter.questions.length - filled} ข้อ`;
  }

  function resizeInput(input) {
    if (!input) return;
    const style = window.getComputedStyle(input);
    if (!resizeInput.canvas) resizeInput.canvas = document.createElement('canvas');
    const context = resizeInput.canvas.getContext('2d');
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = input.value || input.placeholder || '';
    const width = Math.min(520, Math.max(132, Math.ceil(context.measureText(text).width) + 38));
    input.style.width = `${width}px`;
  }

  function resizeAllInputs() {
    $$('.answer-input').forEach((input) => resizeInput(input));
  }

  function updateProgressUI() {
    const chapter = chapterById(currentChapter);
    const filled = filledStats(chapter).filled;
    const complete = chapterStats(chapter).checked === chapter.questions.length;

    $('#metricAnswered').textContent = `${filled} / ${chapter.questions.length}`;
    $('#metricStatus').textContent = complete ? 'ส่งแล้ว' : 'กำลังทำ';
    $('#summaryBtn').hidden = !complete;
    $('#asideAnswered').textContent = String(filled);
    $('#asideTotal').textContent = `/ ${chapter.questions.length} ข้อ`;
    $('#asideFill').style.width = `${Math.round((filled / chapter.questions.length) * 100)}%`;
    updateDock(chapter, filled);

    chapter.questions.forEach((question) => {
      const item = document.getElementById(`q-${question.id}`);
      if (!item) return;
      const answer = state.answers[question.id] || null;
      const draft = state.drafts[question.id] || '';
      const hasDraft = Boolean(draft.trim());
      const meta = answer ? statusMeta(answer) : { label: hasDraft ? 'กรอกแล้ว' : 'ยังไม่ตอบ', className: hasDraft ? 'is-filled' : '' };
      const status = $('[data-role="status"]', item);
      if (status) {
        status.className = `ws-status${meta.className ? ` ${meta.className}` : ''}`;
        status.textContent = meta.label;
      }
      const rail = $(`.ws-nav-btn[data-qid="${question.id}"]`, $('#questionRail'));
      if (rail) {
        rail.classList.toggle('is-correct', Boolean(answer && answer.correct));
        rail.classList.toggle('is-wrong', Boolean(answer && !answer.correct));
        rail.classList.toggle('is-filled', Boolean(!answer && hasDraft));
      }
    });

    if (isChoiceChapter(chapter)) syncChoiceBank(chapter);
    if ($('#submitError').textContent) refreshMissingError();
    syncSubmitDock();
    updateTopStats();
  }

  function recordInput(input) {
    if (!input) return;
    const questionId = input.dataset.qid;
    if (!questionId) return;
    if (input.value.trim()) state.drafts[questionId] = input.value;
    else delete state.drafts[questionId];
    saveState();
    resizeInput(input);
    clearMissingState(questionId);
    updateProgressUI();
  }

  function handleInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains('answer-input')) return;
    recordInput(input);
  }

  function focusQuestion(question, options = {}) {
    if (!question) return;
    const item = document.getElementById(`q-${question.id}`);
    if (!item) return;
    if (options.scroll !== false) {
      item.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    }
    window.requestAnimationFrame(() => {
      const input = document.getElementById(`answer-${question.id}`);
      if (input) input.focus({ preventScroll: true });
      else {
        item.setAttribute('tabindex', '-1');
        item.focus({ preventScroll: true });
      }
      markCurrentRail(question.id);
    });
  }

  function markCurrentRail(questionId) {
    $$('.ws-nav-btn', $('#questionRail')).forEach((button) => {
      button.classList.toggle('is-current', button.dataset.qid === questionId);
    });
  }

  function toggleHint(questionId) {
    const question = chapterById(currentChapter).questions.find((item) => item.id === questionId);
    if (!question) return;
    state.hints[questionId] = !state.hints[questionId];
    if (!state.hints[questionId]) delete state.hints[questionId];
    saveState();
    const button = document.querySelector(`.hint-toggle[data-qid="${questionId}"]`);
    const box = document.getElementById(`hint-${questionId}`);
    const open = Boolean(state.hints[questionId]);
    if (button) {
      button.setAttribute('aria-expanded', String(open));
      button.textContent = open ? 'ซ่อนคำใบ' : 'ดูคำใบ';
    }
    if (box) box.hidden = !open;
  }

  function missingQuestions(chapter) {
    return chapter.questions.filter((question) => {
      const field = document.getElementById(`answer-${question.id}`);
      if (field instanceof HTMLInputElement) return !field.value.trim();
      if (field && field.hasAttribute('data-blank')) return !(state.drafts[question.id] || '').trim();
      const answer = state.answers[question.id];
      return !answer || !String(answer.value || '').trim();
    });
  }

  function refreshMissingError() {
    const chapter = chapterById(currentChapter);
    const missing = missingQuestions(chapter);
    $('#submitError').textContent = missing.length ? `ยังไม่ครบ ${missing.length} ข้อ` : '';
    return missing;
  }

  function submitChapter() {
    const chapter = chapterById(currentChapter);
    if (chapterStats(chapter).checked === chapter.questions.length) {
      showSummary(chapter.id);
      return;
    }

    const missing = missingQuestions(chapter);
    if (missing.length) {
      missing.forEach((question) => {
        const item = document.getElementById(`q-${question.id}`);
        const input = document.getElementById(`answer-${question.id}`);
        if (item) {
          item.classList.add('is-missing');
          const support = $('.ws-support', item);
          if (support && !$('.missing-note', support)) {
            const note = document.createElement('p');
            note.className = 'missing-note';
            note.textContent = 'กรุณาเติมคำตอบข้อนี้ก่อนส่ง';
            support.appendChild(note);
          }
        }
        if (input) input.setAttribute('aria-invalid', 'true');
      });
      $('#submitError').textContent = `ยังไม่ครบ ${missing.length} ข้อ`;
      focusQuestion(missing[0]);
      return;
    }

    chapter.questions.forEach((question) => {
      const field = document.getElementById(`answer-${question.id}`);
      const value = field instanceof HTMLInputElement
        ? field.value.trim()
        : (state.drafts[question.id] || '').trim();
      state.answers[question.id] = {
        value,
        correct: isCorrect(value, question),
        checked: true
      };
      delete state.drafts[question.id];
    });
    saveState();
    updateTopStats();
    showSummary(chapter.id);
  }

  /* ---------- Summary ---------- */
  function renderSummary() {
    const chapter = chapterById(currentChapter);
    const stats = chapterStats(chapter);
    const complete = stats.checked === chapter.questions.length;
    const percent = complete
      ? Math.round((stats.correct / chapter.questions.length) * 100)
      : (stats.checked ? Math.round((stats.correct / stats.checked) * 100) : 0);
    const pass = complete && percent >= 70;

    $('#summaryKicker').textContent = `บทที่ ${pad2(chapter.id)} / ${pad2(CHAPTER_TOTAL)} · ${chapter.questions.length} ข้อ`;
    $('#summaryTitle').textContent = `ผลการฝึกบทที่ ${chapter.id}`;
    $('#summaryScore').textContent = String(stats.correct);
    $('#summaryDenom').textContent = String(chapter.questions.length);
    $('#summaryLast').textContent = `ข้อ ${pad2(chapter.questions.length)}`;
    $('#summaryDone').textContent = `${stats.checked} / ${chapter.questions.length}`;
    $('#summaryWrong').textContent = String(stats.wrong);
    $('#summarySkipped').textContent = String(stats.unanswered);
    $('#summaryAccuracy').textContent = complete || stats.checked ? `${percent}%` : '—';

    const caption = $('#summaryCaption');
    if (!complete) {
      caption.textContent = `ทำแล้ว ${stats.checked} จาก ${chapter.questions.length} ข้อ — กลับไปเติมให้ครบแล้วกดส่งครั้งเดียว`;
    } else if (stats.correct === chapter.questions.length) {
      caption.textContent = 'ครบทุกข้อโดยไม่พลาด — เก็บรายละเอียดของบทนี้ได้แม่นแล้ว';
    } else if (pass) {
      caption.textContent = `ผ่านเกณฑ์ 70% — มี ${stats.wrong} ข้อที่ควรกลับไปทบทวน`;
    } else {
      caption.textContent = `ยังไม่ถึงเกณฑ์ 70% — อ่านคำใบและคำอธิบายในแต่ละข้อ แล้วลองบทนี้อีกครั้ง`;
    }

    const stamp = $('#summaryStamp');
    if (!complete) {
      stamp.className = 'stamp is-neutral';
      stamp.innerHTML = 'ยังไม่ครบ<small>กลับไปทำต่อ</small>';
    } else if (pass) {
      stamp.className = 'stamp is-pass';
      stamp.innerHTML = `ผ่านเกณฑ์<small>${percent}%</small>`;
    } else {
      stamp.className = 'stamp';
      stamp.innerHTML = `ต้องทบทวน<small>${percent}%</small>`;
    }

    $('#scoreTrack').innerHTML = chapter.questions.map((question) => {
      const answer = state.answers[question.id];
      const className = answer ? (answer.correct ? 'is-correct' : 'is-wrong') : '';
      return `<span class="score-seg ${className}"></span>`;
    }).join('');

    $('#reviewList').innerHTML = chapter.questions.map((question) => {
      const answer = state.answers[question.id] || null;
      const meta = statusMeta(answer);
      const prompt = answer
        ? escapeHtml(question.prompt).replace('{{blank}}', () => `<mark>${escapeHtml(question.answer)}</mark>`)
        : escapeHtml(question.prompt).replace('{{blank}}', () => '<mark>______</mark>');
      const detail = answer ? `
        <dl class="review-grid">
          <div class="review-block"><dt>คำตอบที่ถูก</dt><dd class="answer">${escapeHtml(question.answer)}</dd></div>
          <div class="review-block"><dt>คำตอบของคุณ</dt><dd>${escapeHtml(answer.value)}</dd></div>
          <div class="review-block" style="grid-column:1/-1"><dt>คำอธิบาย</dt><dd>${escapeHtml(question.explain)}</dd></div>
        </dl>
        <details class="review-hint">
          <summary>ดูคำใบ / ตัวอย่างประกอบ</summary>
          <p>${escapeHtml(question.example)}</p>
        </details>
      ` : `
        <dl class="review-grid">
          <div class="review-block" style="grid-column:1/-1"><dt>สถานะ</dt><dd>ยังไม่ได้ตอบข้อนี้ — กลับไปเติมคำตอบให้ครบทั้งบทแล้วกดส่ง</dd></div>
          <div class="review-block" style="grid-column:1/-1"><dt>ทำต่อ</dt><dd><button class="btn btn-quiet btn-small" type="button" data-action="goto-question" data-index="${question.number - 1}">ไปทำข้อนี้</button></dd></div>
        </dl>
      `;
      return `
        <details class="review-item" data-qid="${question.id}">
          <summary>
            <span class="review-no">ข้อ ${pad2(question.number)}</span>
            <span class="review-objective">${escapeHtml(question.objective)}</span>
            <span class="review-status${meta.className ? ` ${meta.className}` : ''}">${meta.label}</span>
          </summary>
          <div class="review-body">
            <p class="review-prompt">${prompt}</p>
            ${detail}
          </div>
        </details>
      `;
    }).join('');

    const actions = [];
    if (!complete) {
      actions.push(`<button class="btn btn-primary" type="button" data-action="remaining">ทำข้อที่เหลือ (${stats.unanswered})</button>`);
      actions.push(`<button class="btn btn-quiet" type="button" data-action="review-all">กลับไปทำทั้งบท</button>`);
      actions.push(`<button class="btn-text" type="button" data-action="retry-chapter">เริ่มบทนี้ใหม่</button>`);
      actions.push(`<button class="btn-text" type="button" data-action="home">กลับหน้าหลัก</button>`);
    } else {
      if (stats.wrong > 0) {
        actions.push(`<button class="btn btn-primary" type="button" data-action="review-wrong">ทบทวนข้อที่ผิด (${stats.wrong})</button>`);
      } else {
        actions.push(`<button class="btn btn-primary" type="button" data-action="next-chapter">${currentChapter < CHAPTER_TOTAL ? 'บทถัดไป' : 'กลับหน้าหลัก'}</button>`);
      }
      actions.push(`<button class="btn btn-quiet" type="button" data-action="review-all">ทบทวนทุกข้อ</button>`);
      actions.push(`<button class="btn btn-quiet" type="button" data-action="retry-chapter">เริ่มบทนี้ใหม่</button>`);
      actions.push(`<button class="btn-text" type="button" data-action="home">กลับหน้าหลัก</button>`);
    }
    $('#summaryActions').innerHTML = actions.join('');
  }

  function jumpToWrong() {
    const chapter = chapterById(currentChapter);
    const firstWrong = chapter.questions.find((question) => {
      const answer = state.answers[question.id];
      return answer && !answer.correct;
    });
    if (!firstWrong) return;
    const item = document.querySelector(`.review-item[data-qid="${firstWrong.id}"]`);
    if (!item) return;
    item.open = true;
    item.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
    const summary = item.querySelector('summary');
    if (summary) summary.focus({ preventScroll: true });
  }

  /* ---------- Reset ---------- */
  function openReset(type, chapter = null) {
    resetTarget = { type, chapter };
    const all = type === 'all';
    const mcqAll = type === 'mcq-all';
    const mcqOne = type === 'mcq';
    const chapterData = chapter ? chapterById(chapter) : null;
    if (mcqAll) {
      $('#resetTitle').textContent = 'ล้างความคืบหน้าโหมด 4 ตัวเลือกทั้งหมด';
      $('#resetMessage').textContent = `คำตอบและคะแนนของทั้ง ${Object.keys(MCQ_BANKS).length} บท (${MCQ_TOTAL} ข้อ) จะถูกลบ ไม่สามารถย้อนกลับได้`;
      $('#confirmReset').textContent = 'ล้างทั้งหมด';
    } else if (mcqOne) {
      $('#resetTitle').textContent = `เริ่มบทที่ ${chapter} ใหม่`;
      $('#resetMessage').textContent = `คำตอบและคะแนนของบทที่ ${chapter}${chapterData ? ` ${chapterData.title}` : ''} จะถูกลบ เพื่อให้เริ่มทำบทนี้ใหม่`;
      $('#confirmReset').textContent = 'เริ่มบทนี้ใหม่';
    } else {
      $('#resetTitle').textContent = all ? 'ล้างความคืบหน้าทั้งหมด' : `เริ่มบทที่ ${chapter} ใหม่`;
      $('#resetMessage').textContent = all
        ? `คำตอบและคะแนนของทั้ง ${CHAPTER_TOTAL} บท (${TOTAL} ข้อ) จะถูกลบ ไม่สามารถย้อนกลับได้`
        : `คำตอบและคะแนนของบทที่ ${chapter} ${chapterData ? chapterData.title : ''} จะถูกลบ เพื่อให้เริ่มทำบทนี้ใหม่`;
      $('#confirmReset').textContent = all ? 'ล้างทั้งหมด' : 'เริ่มบทนี้ใหม่';
    }
    const dialog = $('#resetDialog');
    if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
  }

  function resetMcqChapter(chapter) {
    const id = Number(chapter);
    if (!MCQ_BANKS[id]) return;
    mcqStates[id] = { answers: {}, submitted: false };
    try { localStorage.removeItem(`csorg_mcq_chapter${id}_v1`); } catch (_) { /* Storage is optional. */ }
    if (mcqChapter === id) mcq = mcqStates[id];
  }

  function confirmReset() {
    const type = resetTarget.type;
    if (type === 'mcq-all') {
      Object.keys(MCQ_BANKS).forEach((id) => resetMcqChapter(id));
    } else if (type === 'mcq') {
      resetMcqChapter(resetTarget.chapter);
    } else if (type === 'all') {
      state = emptyState();
    } else if (resetTarget.chapter) {
      const prefix = `${resetTarget.chapter}-`;
      Object.keys(state.answers).forEach((key) => { if (key.startsWith(prefix)) delete state.answers[key]; });
      Object.keys(state.drafts).forEach((key) => { if (key.startsWith(prefix)) delete state.drafts[key]; });
      Object.keys(state.hints).forEach((key) => { if (key.startsWith(prefix)) delete state.hints[key]; });
    }
    saveState();
    const dialog = $('#resetDialog');
    if (dialog) dialog.close();
    if (type === 'mcq-all') {
      renderMultipleHome();
      setView('multiple');
      scrollPageTop();
      focusHeading($('#multipleTitle'));
    } else if (type === 'mcq') {
      if (currentView === 'mcq') {
        renderMcq();
        scrollPageTop();
        focusHeading($('#mcqTitle'));
      } else {
        renderMultipleHome();
      }
    } else if (type === 'all') {
      showHome();
    } else {
      openChapter(resetTarget.chapter, 0);
    }
  }

  function closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog) dialog.close();
  }

  /* ---------- Events ---------- */
  function handleAction(action, element) {
    switch (action) {
      case 'select-mode':
        setView('mode');
        scrollPageTop();
        $('[data-action="select-fill"]').focus({ preventScroll: true });
        break;
      case 'select-fill':
        showHome();
        break;
      case 'select-multiple':
        renderMultipleHome();
        setView('multiple');
        document.title = 'CS:ORG — แบบทดสอบ 4 ตัวเลือก';
        scrollPageTop();
        focusHeading($('#multipleTitle'));
        break;
      case 'open-mcq':
        mcqChapter = Number(element.dataset.mcqChapter) || 1;
        if (!MCQ_BANKS[mcqChapter]) break;
        mcqQuestions = MCQ_BANKS[mcqChapter];
        mcq = mcqStates[mcqChapter];
        setView('mcq');
        renderMcq();
        document.title = `บทที่ ${mcqChapter} — แบบทดสอบ 4 ตัวเลือก | CS:ORG`;
        scrollPageTop();
        focusHeading($('#mcqTitle'));
        break;
      case 'retry-mcq':
        openReset('mcq', mcqChapter);
        break;
      case 'reset-mcq-all':
        openReset('mcq-all');
        break;
      case 'home':
        if (currentView === 'mcq') {
          handleAction('select-multiple', element);
          break;
        }
        if (currentView === 'mode' || currentView === 'multiple') {
          setView('mode');
          scrollPageTop();
          $('[data-action="select-fill"]').focus({ preventScroll: true });
        } else showHome();
        break;
      case 'help-mcq':
      case 'help': {
        const dialog = $(action === 'help-mcq' || currentView === 'multiple' || currentView === 'mcq' ? '#mcqHelpDialog' : '#helpDialog');
        if (dialog && typeof dialog.showModal === 'function') dialog.showModal();
        break;
      }
      case 'continue':
        continueTraining();
        break;
      case 'summary':
        showSummary(currentChapter);
        break;
      case 'submit':
        submitChapter();
        break;
      case 'toggle-hint':
        toggleHint(element.dataset.qid);
        break;
      case 'reset-all':
        openReset('all');
        break;
      case 'retry-chapter':
        openReset('chapter', currentChapter);
        break;
      case 'remaining': {
        const chapter = chapterById(currentChapter);
        const index = chapter.questions.findIndex((question) => !state.answers[question.id]);
        openChapter(chapter.id, index === -1 ? 0 : index);
        break;
      }
      case 'review-all':
        openChapter(currentChapter, 0);
        break;
      case 'review-wrong':
        jumpToWrong();
        break;
      case 'next-chapter':
        if (currentChapter < CHAPTER_TOTAL) openChapter(currentChapter + 1, 0);
        else showHome();
        break;
      case 'goto-question': {
        const index = Number(element.dataset.index);
        openChapter(currentChapter, Number.isInteger(index) ? index : 0);
        break;
      }
      default:
        break;
    }
  }

  document.addEventListener('click', (event) => {
    const picker = document.getElementById('answerPicker');
    if (picker && !picker.hidden) {
      if (event.target.closest('[data-picker-close]')) {
        closeAnswerPicker(true);
        return;
      }
      if (event.target.closest('[data-picker-clear]')) {
        if (pickerQuestionId) chooseAnswer(pickerQuestionId, '');
        return;
      }
      const option = event.target.closest('.answer-option');
      if (option) {
        if (pickerQuestionId) chooseAnswer(pickerQuestionId, option.dataset.answer || '');
        return;
      }
      if (event.target.closest('.answer-picker')) return;
    }

    const choiceButton = event.target.closest('.answer-choice');
    if (choiceButton) {
      if (pickerOwner === choiceButton && picker && !picker.hidden) closeAnswerPicker(true);
      else openAnswerPicker(choiceButton);
      return;
    }
    if (picker && !picker.hidden) closeAnswerPicker(false);

    const close = event.target.closest('[data-close]');
    if (close) {
      closeDialog(close.dataset.close);
      return;
    }

    const actionElement = event.target.closest('[data-action]');
    if (actionElement) {
      handleAction(actionElement.dataset.action, actionElement);
      return;
    }

    const chip = event.target.closest('.word-chip');
    if (chip && !chip.disabled) {
      const inputs = $$('.answer-input');
      if (!inputs.length) return;
      let target = lastFocusedInput && document.contains(lastFocusedInput) && !lastFocusedInput.disabled
        ? lastFocusedInput
        : inputs.find((input) => !input.value.trim()) || inputs[0];
      if (!target) target = inputs[0];
      target.value = chip.dataset.answer || '';
      recordInput(target);
      target.focus({ preventScroll: true });
      return;
    }

    const railButton = event.target.closest('.ws-nav-btn');
    if (railButton) {
      const chapter = chapterById(currentChapter);
      const question = chapter.questions.find((item) => item.id === railButton.dataset.qid);
      focusQuestion(question);
      return;
    }

    const tab = event.target.closest('.chapter-tab');
    if (tab) {
      openChapter(Number(tab.dataset.chapter));
      return;
    }

    const lane = event.target.closest('.lane');
    if (lane) {
      const chapter = chapterById(Number(lane.dataset.chapter));
      if (chapterStats(chapter).checked === chapter.questions.length) showSummary(chapter.id);
      else openChapter(chapter.id);
      return;
    }

    const row = event.target.closest('.chapter-row');
    if (row) {
      const chapter = chapterById(Number(row.dataset.chapter));
      if (chapterStats(chapter).checked === chapter.questions.length) showSummary(chapter.id);
      else openChapter(chapter.id);
    }
  });

  $('#mcqForm').addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('input[type="radio"]')) return;
    const index = Number(input.name.replace('mcq-', ''));
    if (!Number.isInteger(index) || mcq.answers[index] !== undefined) return;
    mcq.answers[index] = Number(input.value);
    if (Object.keys(mcq.answers).length === mcqQuestions.length) mcq.submitted = true;
    saveMcq();
    const field = document.getElementById(`mcq-${index}`);
    if (field) field.outerHTML = mcqQuestionHtml(mcqQuestions[index], index);
    $('#mcqError').textContent = '';
    $('#mcqRetry').hidden = false;
    updateMcqProgress();
    const feedback = document.querySelector(`#mcq-${index} .mcq-feedback`);
    if (feedback) feedback.focus({ preventScroll: true });
  });
  $('#mcqForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (mcq.submitted || Object.keys(mcq.answers).length !== mcqQuestions.length) return;
    mcq.submitted = true;
    saveMcq();
    renderMcq();
  });

  document.addEventListener('input', (event) => {
    handleInput(event);
  });

  document.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.classList.contains('answer-input')) {
      lastFocusedInput = event.target;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      const picker = document.getElementById('answerPicker');
      if (picker && !picker.hidden) {
        event.preventDefault();
        closeAnswerPicker(true);
        return;
      }
    }
    if (!event.target.classList || !event.target.classList.contains('answer-input')) return;
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const inputs = $$('.answer-input');
    const index = inputs.indexOf(event.target);
    if (index === -1) return;
    if (event.shiftKey) {
      if (index > 0) inputs[index - 1].focus();
      return;
    }
    const nextEmpty = inputs.slice(index + 1).find((input) => !input.value.trim());
    const next = nextEmpty || inputs[index + 1];
    if (next) next.focus();
    else $('#submitBtn').focus();
  });

  $('#confirmReset').addEventListener('click', confirmReset);

  $$('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  window.addEventListener('resize', () => {
    closeAnswerPicker(false);
    resizeAllInputs();
  });

  window.addEventListener('scroll', () => {
    closeAnswerPicker(false);
  }, { passive: true });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(resizeAllInputs).catch(() => {});
  }

  /* Validate that each prompt has exactly one blank. */
  CHAPTERS.forEach((chapter) => {
    chapter.questions.forEach((question) => {
      const blanks = (question.prompt.match(/\{\{blank\}\}/g) || []).length;
      if (blanks !== 1) console.warn('Question blank count:', chapter.id, question.number, blanks);
    });
  });

  updateStaticCounts();
  pickerNode();
  renderHome();
  updateTopStats();
  syncSubmitDock();
  document.title = 'CS:ORG — แล็บเติมคำ โครงสร้างระบบคอมพิวเตอร์';
  let savedView = null;
  try { savedView = JSON.parse(sessionStorage.getItem(VIEW_STORAGE_KEY)); } catch (_) { /* Start at mode selection. */ }
  if (savedView && typeof savedView === 'object') {
    const chapter = Number(savedView.chapter);
    switch (savedView.view) {
      case 'home':
        showHome();
        break;
      case 'quiz':
        if (chapterById(chapter)) openChapter(chapter);
        break;
      case 'summary':
        if (chapterById(chapter)) showSummary(chapter);
        break;
      case 'multiple':
        handleAction('select-multiple');
        break;
      case 'mcq':
        if (Object.prototype.hasOwnProperty.call(MCQ_BANKS, chapter)) {
          handleAction('open-mcq', { dataset: { mcqChapter: chapter } });
        }
        break;
      default:
        break;
    }
  }
})();
