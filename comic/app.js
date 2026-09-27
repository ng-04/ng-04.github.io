// Comic Storybook Maker
// Claude writes the story, Gemini ("Nano Banana") draws the pictures.
// Everything runs in the browser. API keys are entered by the user and kept in localStorage.

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-5';
const GEMINI_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const IMAGE_CONCURRENCY = 3;
const IMAGE_ATTEMPTS = 3;

const STYLE =
  "Children's comic book illustration, bold black ink outlines, bright flat primary colors, " +
  'soft halftone dot shading, warm and joyful, rounded friendly characters. ' +
  'Absolutely no text, letters or speech bubbles in the image.';

const KEY_FIELDS = { anthropicKey: 'comicAnthropicKey', workspaceId: 'comicWorkspaceId', geminiKey: 'comicGeminiKey' };

// ---------- State ----------

const state = {
  photo: null,       // { url, mime, data }
  title: '',
  characters: '',
  pages: [],         // { caption, prompt, img, mime, status: idle|loading|done|error|nokey, err }
  geminiKey: '',
  runId: 0,          // bumps on every new story so stale image responses are ignored
};

// ---------- DOM ----------

const $ = (id) => document.getElementById(id);
const form = $('form-screen');
const screens = { form, writing: $('writing-screen'), comic: $('comic-screen') };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function show(name) {
  for (const [k, node] of Object.entries(screens)) node.hidden = k !== name;
  window.scrollTo(0, 0);
}

function showError(msg) {
  const box = $('form-error');
  box.textContent = msg;
  box.hidden = !msg;
}

// ---------- Local storage (wrapped: can throw in private mode) ----------

function load(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

for (const [field, storageKey] of Object.entries(KEY_FIELDS)) {
  const input = form.elements[field];
  input.value = load(storageKey);
  input.addEventListener('input', () => save(storageKey, input.value.trim()));
}

// ---------- Family photo ----------

$('photo-input').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result;
    state.photo = { url, mime: file.type || 'image/jpeg', data: url.split(',')[1] };
    const preview = $('photo-preview');
    preview.src = url;
    preview.hidden = false;
    $('photo-remove').hidden = false;
  };
  reader.readAsDataURL(file);
});

$('photo-remove').addEventListener('click', () => {
  state.photo = null;
  $('photo-input').value = '';
  $('photo-preview').hidden = true;
  $('photo-preview').removeAttribute('src');
  $('photo-remove').hidden = true;
});

// ---------- Story (Claude) ----------

function readForm() {
  const f = Object.fromEntries(new FormData(form));
  for (const k of Object.keys(f)) if (typeof f[k] === 'string') f[k] = f[k].trim();
  f.pages = Number(f.pages);
  return f;
}

function storyPrompt(f) {
  const n = f.pages;
  return `Write a ${n}-page comic storybook for a ${f.age}-year-old.
Hero: ${f.hero}, a ${f.age}-year-old ${f.gender}. Other characters: ${f.others}.
Story idea: ${f.idea}
Tone: ${f.tone}.
Page 1 is the cover (caption = a short tagline). Page ${n} is the final page (a warm closing line; "The End" is added by the layout, don't write it).
Captions: 1-3 short, simple sentences a ${f.age}-year-old can follow. Use the names.
imagePrompt: a vivid scene description for an illustrator (who, where, action, expression, lighting). No text in image.
Return ONLY valid JSON, no markdown:
{"title":"cover title","characters":"one consistent visual description of every character (age, hair, clothes incl. hero costume)","pages":[{"caption":"...","imagePrompt":"..."}]}`;
}

// Sends one Messages API request. Keys that aren't scoped to a workspace
// need the anthropic-workspace-id header, so it's added when one is given.
async function callClaude(f, content, maxTokens) {
  const headers = {
    'x-api-key': f.anthropicKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (f.workspaceId) headers['anthropic-workspace-id'] = f.workspaceId;
  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Claude API error ${res.status}`);
  return data;
}

async function writeStory(f) {
  const data = await callClaude(f, storyPrompt(f), 4000);

  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Claude did not return JSON');
  const story = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(story.pages) || !story.pages.length) throw new Error('Story has no pages');
  return story;
}

async function generate() {
  const f = readForm();
  showError('');
  if (!f.anthropicKey) {
    show('form');
    showError('Please paste your Anthropic API key so Claude can write the story.');
    form.elements.anthropicKey.focus();
    return;
  }

  const runId = ++state.runId;
  show('writing');
  try {
    const story = await writeStory(f);
    if (runId !== state.runId) return;
    state.title = story.title || 'My Comic';
    state.characters = story.characters || '';
    state.geminiKey = f.geminiKey;
    state.pages = story.pages.slice(0, f.pages).map((p) => ({
      caption: p.caption || '',
      prompt: p.imagePrompt || '',
      img: null,
      mime: null,
      status: f.geminiKey ? 'idle' : 'nokey',
      err: '',
    }));
    renderComic();
    show('comic');
    if (f.geminiKey) drawAll(runId);
  } catch (e) {
    if (runId !== state.runId) return;
    show('form');
    showError(`Story generation failed. Try again. (${e.message})`);
  }
}

// ---------- Key tests ----------

// Anthropic: a 1-token message (costs a fraction of a cent) proves the key,
// workspace, model access and billing all work.
async function testAnthropic(f) {
  if (!f.anthropicKey) throw new Error('Paste a key first.');
  await callClaude(f, 'Hi', 1);
  return `Works with ${CLAUDE_MODEL}.`;
}

// Gemini: looking up the image model is free and proves the key can reach it.
async function testGemini(f) {
  if (!f.geminiKey) throw new Error('Paste a key first.');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`, {
    headers: { 'x-goog-api-key': f.geminiKey },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Gemini API error ${res.status}`);
  return `Works with ${GEMINI_MODEL}.`;
}

const KEY_TESTS = {
  anthropic: { run: testAnthropic, status: 'anthropic-status', inputs: ['anthropicKey', 'workspaceId'] },
  gemini: { run: testGemini, status: 'gemini-status', inputs: ['geminiKey'] },
};

function setKeyStatus(id, kind, text) {
  const box = $(id);
  box.className = `key-status ${kind}`;
  box.textContent = text;
}

for (const [name, test] of Object.entries(KEY_TESTS)) {
  const button = form.querySelector(`[data-test="${name}"]`);
  button.addEventListener('click', async () => {
    button.disabled = true;
    setKeyStatus(test.status, 'busy', 'Testing...');
    try {
      setKeyStatus(test.status, 'ok', `✓ ${await test.run(readForm())}`);
    } catch (e) {
      setKeyStatus(test.status, 'bad', `✗ ${e.message}`);
    } finally {
      button.disabled = false;
    }
  });
  // An old result no longer applies once the key changes.
  for (const field of test.inputs) {
    form.elements[field].addEventListener('input', () => setKeyStatus(test.status, '', ''));
  }
}

// ---------- Pictures (Gemini) ----------

async function drawAll(runId) {
  // Cover first, so every other page can match its character designs.
  await drawPage(0, runId);
  const queue = state.pages.map((_, i) => i).slice(1);
  const worker = async () => {
    while (queue.length && runId === state.runId) await drawPage(queue.shift(), runId);
  };
  await Promise.all(Array.from({ length: IMAGE_CONCURRENCY }, worker));
}

// Gemini can answer 200 OK with no picture: a safety block (the reason is in
// promptFeedback.blockReason or candidates[0].finishReason) or, now and then,
// just an empty answer. Blocks are reported; empty answers and rate limits
// are marked retryable.
const SAFETY_REASONS = /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/;

function imageError(message, retryable) {
  const e = new Error(message);
  e.retryable = retryable;
  return e;
}

async function requestImage(parts) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': state.geminiKey },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw imageError(data.error?.message || `Gemini API error ${res.status}`, res.status === 429 || res.status >= 500);
  }

  const candidate = data.candidates?.[0];
  const outParts = candidate?.content?.parts || [];
  const imgPart = outParts.find((p) => p.inlineData || p.inline_data);
  if (imgPart) {
    const d = imgPart.inlineData || imgPart.inline_data;
    const mime = d.mimeType || d.mime_type || 'image/png';
    return { img: `data:${mime};base64,${d.data}`, mime };
  }

  const reason = data.promptFeedback?.blockReason || candidate?.finishReason || 'no reason given';
  const detail = [data.promptFeedback?.blockReasonMessage, candidate?.finishMessage,
    ...outParts.map((p) => p.text)].filter(Boolean).join(' ');
  if (SAFETY_REASONS.test(reason)) {
    const tip = state.photo ? ' Gemini often blocks edits of real photos, especially of children: try again without the family photo.' : ' Try Redraw, or edit the story idea.';
    throw imageError(`Blocked by Gemini's safety filter (${reason}).${detail ? ' ' + detail : ''}${tip}`, false);
  }
  throw imageError(`No image returned (${reason}).${detail ? ' ' + detail : ''}`, true);
}

async function drawPage(i, runId = state.runId) {
  const page = state.pages[i];
  if (!page) return;
  state.geminiKey = form.elements.geminiKey.value.trim();
  if (!state.geminiKey) { update(i, { status: 'nokey' }); return; }
  update(i, { status: 'loading', err: '' });

  const cover = state.pages[0];
  const useCover = i > 0 && cover.img;
  let text = `${STYLE}\nCharacters: ${state.characters}\n`;
  if (state.photo) text += "Base the characters' faces on the attached family photo. ";
  if (useCover) text += 'Match the character designs in the attached cover illustration.';
  text += `\nScene: ${page.prompt}\nLandscape 4:3 composition.`;

  const parts = [{ text }];
  if (state.photo) parts.push({ inline_data: { mime_type: state.photo.mime, data: state.photo.data } });
  if (useCover) parts.push({ inline_data: { mime_type: cover.mime, data: cover.img.split(',')[1] } });

  try {
    let lastError;
    for (let attempt = 1; attempt <= IMAGE_ATTEMPTS; attempt++) {
      try {
        const { img, mime } = await requestImage(parts);
        if (runId !== state.runId) return;
        update(i, { status: 'done', img, mime });
        return;
      } catch (e) {
        lastError = e;
        if (!e.retryable || attempt === IMAGE_ATTEMPTS || runId !== state.runId) break;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    throw lastError;
  } catch (e) {
    if (runId !== state.runId) return;
    update(i, { status: 'error', err: e.message });
  }
}

function update(i, patch) {
  Object.assign(state.pages[i], patch);
  const old = document.querySelector(`[data-index="${i}"]`);
  if (old) old.replaceWith(renderPage(i));
  renderProgress();
}

// ---------- Rendering ----------

function renderProgress() {
  const n = state.pages.length;
  const done = state.pages.filter((p) => p.status === 'done').length;
  $('progress').textContent = state.geminiKey
    ? `${done} of ${n} pictures drawn`
    : 'No Gemini key: showing image prompts';
}

function renderArt(p) {
  const art = el('div', { class: 'art' });
  if (p.status === 'loading') {
    art.append(el('div', { class: 'art-overlay' },
      el('div', { class: 'spinner' }),
      el('div', { class: 'drawing-label', text: 'Drawing...' })));
  } else if (p.img) {
    art.append(el('img', { src: p.img, alt: p.prompt }));
  } else {
    const isErr = p.status === 'error';
    art.append(el('div', { class: 'art-overlay' },
      el('div', { class: `art-text${isErr ? ' is-error' : ''}`, text: isErr ? `Image failed: ${p.err}` : p.prompt })));
  }
  return art;
}

function renderPage(i) {
  const p = state.pages[i];
  const isCover = i === 0;
  const isEnd = i === state.pages.length - 1 && !isCover;
  const kind = isCover ? ' cover' : isEnd ? ' end' : '';

  const panel = el('div', { class: `card panel${kind}` },
    isCover && el('h2', { class: 'cover-title', text: state.title }),
    renderArt(p),
    el('div', { class: 'caption-box' },
      el('p', { class: 'caption', text: p.caption, style: 'margin:0' }),
      isEnd && el('div', { class: 'the-end', text: 'The End' })));

  const tools = el('div', { class: 'page-tools' },
    el('button', {
      type: 'button',
      class: 'btn-small',
      text: 'Redraw',
      onclick: () => drawPage(i),
      ...(p.status === 'loading' ? { disabled: '' } : {}),
    }),
    el('div', { class: 'prompt', text: p.prompt }));

  return el('article', { class: 'comic-page', 'data-index': String(i), 'aria-label': `Page ${i + 1}` }, panel, tools);
}

function renderComic() {
  $('panels').replaceChildren(...state.pages.map((_, i) => renderPage(i)));
  renderProgress();
}

// ---------- Wiring ----------

form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });
$('new-btn').addEventListener('click', generate);
$('edit-btn').addEventListener('click', () => show('form'));
$('pdf-btn').addEventListener('click', () => window.print());
