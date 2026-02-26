const MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....',
  6: '-....', 7: '--...', 8: '---..', 9: '----.'
};

const LESSON_DEFAULT = 'ARZSJYEQTPIB';
const HISTORY_KEY = 'morse-history-v1';

const el = {
  charCount: document.getElementById('charCount'),
  wpm: document.getElementById('wpm'),
  frequency: document.getElementById('frequency'),
  volume: document.getElementById('volume'),
  charSpacing: document.getElementById('charSpacing'),
  wordSpacing: document.getElementById('wordSpacing'),
  groupSize: document.getElementById('groupSize'),
  lessonName: document.getElementById('lessonName'),
  customChars: document.getElementById('customChars'),
  usingChars: document.getElementById('usingChars'),
  prestartText: document.getElementById('prestartText'),
  showCurrent: document.getElementById('showCurrent'),
  transcriptionMode: document.getElementById('transcriptionMode'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  displayTitle: document.getElementById('displayTitle'),
  displayBox: document.getElementById('displayBox'),
  keyboard: document.getElementById('keyboard'),
  scoreBox: document.getElementById('scoreBox'),
  history: document.getElementById('history'),
  historyCount: document.getElementById('historyCount')
};

let state = {
  audioCtx: null,
  runId: 0,
  playing: false,
  actualPlayed: '',
  transcription: '',
  targetText: '',
  currentCursor: 0,
  history: []
};

function sanitizeChars(value) {
  return [...value.toUpperCase()].filter((c) => MORSE[c]).join('');
}

function getUsingChars() {
  const custom = sanitizeChars(el.customChars.value.trim());
  return custom || LESSON_DEFAULT;
}

function randomSequence(chars, charCount, groupSize) {
  const out = [];
  for (let i = 0; i < charCount; i += 1) {
    out.push(chars[Math.floor(Math.random() * chars.length)]);
  }
  const grouped = [];
  for (let i = 0; i < out.length; i += groupSize) {
    grouped.push(out.slice(i, i + groupSize).join(''));
  }
  return grouped.join(' ');
}

function ensureAudio() {
  if (!state.audioCtx) {
    state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioCtx.state === 'suspended') {
    state.audioCtx.resume();
  }
  return state.audioCtx;
}

function beep(ctx, startAt, duration, frequency, volume) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.value = volume;
  osc.connect(gain).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function buildKeyboard(chars) {
  el.keyboard.innerHTML = '';
  [...new Set(chars.split(''))].sort().forEach((c) => {
    const k = document.createElement('span');
    k.className = 'key';
    k.textContent = c;
    el.keyboard.appendChild(k);
  });
}

function updateModeUI() {
  const inTranscription = el.transcriptionMode.checked;
  el.displayTitle.textContent = inTranscription ? 'Transcription' : 'Displayed Text';
  el.keyboard.classList.toggle('hidden', !inTranscription);
}

function appendPlayedChar(ch) {
  state.actualPlayed += ch;
  if (el.transcriptionMode.checked) return;
  if (el.showCurrent.checked) {
    el.displayBox.textContent = state.actualPlayed;
  }
}

function computeScore(expected, typed) {
  let good = 0;
  const max = Math.max(expected.length, typed.length, 1);
  for (let i = 0; i < Math.max(expected.length, typed.length); i += 1) {
    if ((expected[i] || '') === (typed[i] || '')) good += 1;
  }
  const normalized = Math.round((good / max) * 10);
  return { good, max, normalized };
}

function markComparison(expected, typed) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < Math.max(expected.length, typed.length); i += 1) {
    const span = document.createElement('span');
    const e = expected[i] || '·';
    const t = typed[i] || '·';
    span.textContent = t;
    span.className = e === t ? 'good' : 'bad';
    frag.appendChild(span);
  }
  el.displayBox.innerHTML = '';
  el.displayBox.appendChild(frag);
}

async function playMessage(runId, message, hidden = false) {
  const ctx = ensureAudio();
  const dot = 1.2 / Number(el.wpm.value);
  const dash = 3 * dot;
  const frequency = Number(el.frequency.value);
  const volume = Number(el.volume.value);
  const charGap = Number(el.charSpacing.value) * dot;
  const wordGap = Number(el.wordSpacing.value) * dot;

  let t = ctx.currentTime + 0.06;

  for (const ch of message) {
    if (runId !== state.runId || !state.playing) return;

    if (ch === ' ') {
      t += wordGap;
      await new Promise((r) => setTimeout(r, wordGap * 1000));
      continue;
    }

    const code = MORSE[ch];
    if (!code) continue;

    for (const symbol of code) {
      const duration = symbol === '.' ? dot : dash;
      beep(ctx, t, duration, frequency, volume);
      t += duration;
      await new Promise((r) => setTimeout(r, duration * 1000));

      t += dot;
      await new Promise((r) => setTimeout(r, dot * 1000));
    }

    t += Math.max(0, charGap - dot);
    if (!hidden) {
      appendPlayedChar(ch);
      state.currentCursor += 1;
    }
    await new Promise((r) => setTimeout(r, Math.max(0, charGap - dot) * 1000));
  }
}

function saveHistory(record) {
  state.history.unshift(record);
  state.history = state.history.slice(0, 50);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
  renderHistory();
}

function renderHistory() {
  el.history.innerHTML = '';
  el.historyCount.textContent = String(Math.min(3, state.history.length));
  state.history.slice(0, 3).forEach((h) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    const score = h.score ? `<div class="history-score">Score: <strong>${h.score.normalized}/10</strong></div>` : '';
    div.innerHTML = `
      <div class="history-time">${new Date(h.ts).toLocaleString()}</div>
      <div>${h.actual || '(nothing played)'}</div>
      ${score}
    `;
    el.history.appendChild(div);
  });
}

function finishPlayback(manualStop = false) {
  state.playing = false;
  el.startBtn.disabled = false;
  el.stopBtn.disabled = true;

  let score = null;
  if (el.transcriptionMode.checked) {
    score = computeScore(state.actualPlayed, state.transcription);
    markComparison(state.actualPlayed, state.transcription);
    el.scoreBox.classList.remove('hidden');
    el.scoreBox.innerHTML = `Score: <strong>${score.normalized}/10</strong> (${score.good}/${score.max})`;
  }

  saveHistory({
    ts: Date.now(),
    actual: state.actualPlayed,
    typed: el.transcriptionMode.checked ? state.transcription : null,
    score,
    lesson: el.lessonName.value.trim(),
    manualStop
  });
}

async function startPlayback() {
  const using = getUsingChars();
  const count = Math.max(1, Number(el.charCount.value));
  const groupSize = Math.max(1, Number(el.groupSize.value));
  const prestart = sanitizeChars(el.prestartText.value || '');
  const text = randomSequence(using, count, groupSize);

  state.runId += 1;
  const runId = state.runId;
  state.playing = true;
  state.actualPlayed = '';
  state.transcription = '';
  state.currentCursor = 0;
  state.targetText = text;

  el.displayBox.textContent = '';
  el.scoreBox.classList.add('hidden');
  el.startBtn.disabled = true;
  el.stopBtn.disabled = false;

  if (el.transcriptionMode.checked) {
    buildKeyboard(using);
  }

  try {
    if (prestart) {
      await playMessage(runId, prestart, true);
    }
    await playMessage(runId, text, false);
  } finally {
    if (runId === state.runId && !el.stopBtn.disabled) {
      finishPlayback(false);
    }
  }
}

function setupTyping() {
  window.addEventListener('keydown', (e) => {
    if (!state.playing || !el.transcriptionMode.checked) return;
    const key = e.key.toUpperCase();
    if (!MORSE[key] && key !== 'BACKSPACE') return;

    if (key === 'BACKSPACE') {
      state.transcription = state.transcription.slice(0, -1);
    } else {
      state.transcription += key;
    }
    el.displayBox.textContent = state.transcription;
  });
}

function loadHistory() {
  try {
    state.history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(state.history)) state.history = [];
  } catch {
    state.history = [];
  }
  renderHistory();
}

function init() {
  el.usingChars.textContent = LESSON_DEFAULT;
  el.customChars.addEventListener('input', () => {
    el.usingChars.textContent = getUsingChars();
  });

  el.showCurrent.addEventListener('change', () => {
    if (!el.showCurrent.checked || el.transcriptionMode.checked) {
      el.displayBox.textContent = '';
    } else {
      el.displayBox.textContent = state.actualPlayed;
    }
  });

  el.transcriptionMode.addEventListener('change', () => {
    updateModeUI();
    el.displayBox.textContent = '';
  });

  el.startBtn.addEventListener('click', startPlayback);
  el.stopBtn.addEventListener('click', () => {
    state.runId += 1;
    if (state.playing) {
      finishPlayback(true);
    }
  });

  updateModeUI();
  setupTyping();
  loadHistory();
}

init();
