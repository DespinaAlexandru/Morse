const MORSE = {
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
  K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
  U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..", 0: "-----", 1: ".----", 2: "..---",
  3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----."
};

const el = (id) => document.getElementById(id);
const refs = {
  wpm: el("wpm"), frequency: el("frequency"), volume: el("volume"), charSpacing: el("charSpacing"),
  wordSpacing: el("wordSpacing"), groupSize: el("groupSize"), charCount: el("charCount"), lesson: el("lesson"),
  customChars: el("customChars"), usingChars: el("usingChars"), preStart: el("preStart"), showCurrent: el("showCurrent"),
  transcriptionMode: el("transcriptionMode"), startBtn: el("startBtn"), stopBtn: el("stopBtn"),
  outputTitle: el("outputTitle"), currentBox: el("currentBox"), transcriptionWrap: el("transcriptionWrap"),
  transcriptionInput: el("transcriptionInput"), keyboard: el("keyboard"), result: el("result"),
  historyTitle: el("historyTitle"), historyList: el("historyList"), clearHistoryBtn: el("clearHistoryBtn")
};

let audioCtx;
let isPlaying = false;
let stopRequested = false;
let playbackChars = "";
const HISTORY_KEY = "morseTrainerHistory";

function sanitizeChars(value) {
  return (value || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function getChosenChars() {
  if (refs.lesson.value === "custom") {
    return sanitizeChars(refs.customChars.value).replace(/ /g, "");
  }
  return refs.lesson.value;
}

function updateUsing() {
  const chosen = getChosenChars() || "(none)";
  refs.usingChars.textContent = chosen;
  buildKeyboard(chosen);
}

function buildKeyboard(chars) {
  refs.keyboard.innerHTML = "";
  const unique = [...new Set(chars.split(""))].filter((c) => c !== " ");
  unique.forEach((ch) => {
    const btn = document.createElement("button");
    btn.textContent = ch;
    btn.type = "button";
    btn.addEventListener("click", () => {
      refs.transcriptionInput.value += ch;
      refs.transcriptionInput.focus();
    });
    refs.keyboard.appendChild(btn);
  });
  const space = document.createElement("button");
  space.textContent = "␣";
  space.type = "button";
  space.addEventListener("click", () => (refs.transcriptionInput.value += " "));
  refs.keyboard.appendChild(space);
}

function generateSequence(chars, count, groupSize) {
  const group = [];
  for (let i = 0; i < count; i++) {
    const pick = chars[Math.floor(Math.random() * chars.length)];
    group.push(pick);
  }

  const words = [];
  for (let i = 0; i < group.length; i += groupSize) {
    words.push(group.slice(i, i + groupSize).join(""));
  }
  return words.join(" ");
}

function unitMs() {
  return 1200 / Number(refs.wpm.value || 18);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tone(ms) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = Number(refs.frequency.value);
  gain.gain.value = Number(refs.volume.value);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  await sleep(ms);
  osc.stop();
}

async function playChar(ch, show) {
  const code = MORSE[ch];
  if (!code) return;
  const dot = unitMs();
  for (let i = 0; i < code.length; i++) {
    if (stopRequested) return;
    const symbol = code[i];
    await tone(symbol === "." ? dot : dot * 3);
    if (i < code.length - 1) await sleep(dot);
  }

  if (show) {
    refs.currentBox.textContent += ch;
  }
  await sleep(dot * Number(refs.charSpacing.value || 3));
}

async function playText(text, visible) {
  for (let i = 0; i < text.length; i++) {
    if (stopRequested) break;
    const ch = text[i];
    if (ch === " ") {
      await sleep(unitMs() * Number(refs.wordSpacing.value || 7));
      if (visible && refs.showCurrent.checked && !refs.transcriptionMode.checked) {
        refs.currentBox.textContent += " ";
      }
      continue;
    }
    await playChar(ch, visible && refs.showCurrent.checked && !refs.transcriptionMode.checked);
    if (visible) playbackChars += ch;
  }
}

function setModeUi() {
  const trans = refs.transcriptionMode.checked;
  refs.outputTitle.textContent = trans ? "Transcription" : "Displayed Text";
  refs.transcriptionWrap.classList.toggle("hidden", !trans);
  refs.currentBox.classList.toggle("hidden", trans);
  refs.result.classList.add("hidden");
}

function evaluateTranscription(expected, actual) {
  const cleanExpected = expected.replace(/\s+/g, "").trim();
  const cleanActual = sanitizeChars(actual).replace(/\s+/g, "");
  let good = 0;
  const length = Math.max(cleanExpected.length, cleanActual.length);
  const chars = [];

  for (let i = 0; i < length; i++) {
    const exp = cleanExpected[i] || "";
    const got = cleanActual[i] || "";
    const ok = exp === got && exp !== "";
    if (ok) good++;
    chars.push({ char: got || "·", ok });
  }

  const score10 = cleanExpected.length ? ((good / cleanExpected.length) * 10) : 0;
  return { chars, score10: Math.round(score10 * 10) / 10, good, total: cleanExpected.length };
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
}

function pushHistory(text, score) {
  const history = loadHistory();
  history.unshift({ at: new Date().toISOString(), text, score });
  saveHistory(history);
  renderHistory();
}

function renderHistory() {
  const history = loadHistory();
  refs.historyTitle.textContent = `History (${history.length})`;
  refs.historyList.innerHTML = "";

  history.forEach((item) => {
    const div = document.createElement("div");
    div.className = "history-item";
    const date = new Date(item.at).toLocaleString();
    div.innerHTML = `<time>${date}</time><div><strong>${item.text || "(empty)"}</strong></div>${item.score !== undefined ? `<div>Score: ${item.score}/10</div>` : ""}`;
    refs.historyList.appendChild(div);
  });
}

async function runPlayback() {
  const chars = getChosenChars();
  if (!chars) {
    alert("Please provide lesson characters.");
    return;
  }

  isPlaying = true;
  stopRequested = false;
  playbackChars = "";
  refs.currentBox.textContent = "";
  refs.transcriptionInput.value = "";
  refs.result.classList.add("hidden");
  refs.startBtn.disabled = true;
  refs.stopBtn.disabled = false;

  const sequence = generateSequence(chars, Number(refs.charCount.value || 120), Number(refs.groupSize.value || 4));
  const pre = sanitizeChars(refs.preStart.value);

  if (pre) {
    await playText(pre, false);
  }

  if (!stopRequested) {
    await playText(sequence, true);
  }

  const playedVisibleText = playbackChars;

  if (refs.transcriptionMode.checked) {
    const result = evaluateTranscription(playedVisibleText, refs.transcriptionInput.value);
    refs.result.classList.remove("hidden");
    refs.result.innerHTML = `<div><strong>Score: ${result.score10}/10 (${result.good}/${result.total})</strong></div>` +
      `<div>${result.chars.map((x) => `<span class="char ${x.ok ? "good" : "bad"}">${x.char}</span>`).join("")}</div>`;
    pushHistory(playedVisibleText, result.score10);
  } else {
    pushHistory(playedVisibleText);
  }

  isPlaying = false;
  refs.startBtn.disabled = false;
  refs.stopBtn.disabled = true;
}

refs.lesson.addEventListener("change", updateUsing);
refs.customChars.addEventListener("input", updateUsing);
refs.transcriptionMode.addEventListener("change", setModeUi);
refs.startBtn.addEventListener("click", () => {
  if (!isPlaying) runPlayback();
});
refs.stopBtn.addEventListener("click", () => {
  stopRequested = true;
  refs.stopBtn.disabled = true;
});
refs.clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

window.addEventListener("keydown", (e) => {
  if (refs.transcriptionMode.checked && /^[A-Za-z0-9 ]$/.test(e.key)) {
    return;
  }
  if (e.code === "Space" && isPlaying) {
    e.preventDefault();
    stopRequested = true;
  }
});

updateUsing();
setModeUi();
renderHistory();
