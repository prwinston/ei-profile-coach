const KICKOFF_TEXT =
  '[SESSION START] Please begin now: deliver the Opening Prompt from Section 11 verbatim, then proceed with Phase 1 orientation.';

const icons = {
  spinner: `<svg class="spin" width="13" height="13" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 100"></circle></svg>`,
};

const state = {
  started: false,
  code: '',
  input: '',
  messages: [], // { role: 'user' | 'assistant', content: string, hidden?: boolean, streaming?: boolean }
  loading: false,
  error: null,
};

const appBody = document.getElementById('app-body');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Minimal markdown: **bold**, blank-line-separated paragraphs, and simple
// bullet lists (lines starting with "•" or "-"). Deliberately plain —
// matches the system instruction's "plain, unformatted prose" requirement
// for scenario content while still making bold headers and lists legible.
function renderMarkdownLite(text) {
  const escaped = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const blocks = escaped.split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length === 0) return '';
      const isList = lines.every((l) => /^[•-]\s+/.test(l));
      if (isList) {
        return `<ul>${lines.map((l) => `<li>${l.replace(/^[•-]\s+/, '')}</li>`).join('')}</ul>`;
      }
      return `<p>${lines.join('<br>')}</p>`;
    })
    .join('');
}

function friendlyError(rawMessage) {
  if (rawMessage === 'Incorrect or missing class code.') return rawMessage;
  return 'The coach did not respond. Please try sending your message again.';
}

// Updates just the streaming bubble's own HTML + scroll position, instead
// of re-rendering the whole chat screen on every token — a full render()
// per token would repeatedly rebuild the composer and steal input focus.
function updateStreamingBubble(content) {
  const el = document.getElementById('streaming-bubble');
  if (!el) return;
  el.innerHTML = content ? renderMarkdownLite(content) : `${icons.spinner} Thinking…`;
  const messagesEl = document.getElementById('messages');
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function runCoachTurn() {
  const assistantMsg = { role: 'assistant', content: '', streaming: true };
  let streamStarted = false;

  try {
    const apiMessages = state.messages.map(({ role, content }) => ({ role, content }));
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: state.code, messages: apiMessages }),
    });

    const contentType = res.headers.get('content-type') || '';

    // Error responses come back as JSON; a healthy call comes back as an
    // SSE stream (text/event-stream) — branch on that rather than on
    // res.ok alone, since a streamed response is also status 200.
    if (!res.ok || contentType.includes('application/json')) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Request failed');
    }

    state.messages.push(assistantMsg);
    streamStarted = true;
    render();

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      assistantMsg.content += decoder.decode(value, { stream: true });
      updateStreamingBubble(assistantMsg.content);
    }

    if (!assistantMsg.content) {
      throw new Error('Empty response received.');
    }
  } catch (e) {
    if (!streamStarted) {
      state.error = friendlyError(e.message);
    } else if (!assistantMsg.content) {
      state.messages.pop(); // drop the empty placeholder bubble
      state.error = friendlyError(e.message);
    } else {
      // Partial content arrived before the stream broke — keep it visible
      // rather than discarding a real (if incomplete) reply.
      state.error = 'The response may have been cut short. You can continue the conversation below.';
    }
  } finally {
    delete assistantMsg.streaming;
    state.loading = false;
    render();
  }
}

function beginSession() {
  state.started = true;
  state.error = null;
  state.messages = [{ role: 'user', content: KICKOFF_TEXT, hidden: true }];
  state.loading = true;
  render();
  runCoachTurn();
}

function sendMessage() {
  const text = state.input.trim();
  if (!text || state.loading) return;
  state.error = null;
  state.messages.push({ role: 'user', content: text });
  state.input = '';
  state.loading = true;
  render();
  runCoachTurn();
}

function restart() {
  state.started = false;
  state.messages = [];
  state.input = '';
  state.error = null;
  render();
}

function renderGate() {
  appBody.innerHTML = `
    <div class="gate-screen">
      <p class="lede">This is a scenario-based <strong>Emotional Intelligence profiling session</strong> for the Feedback Mastery Programme. Over about 20 minutes, you'll respond to eight real-world feedback moments, then receive your personalised EI Profile Card.</p>
      <div class="disclaimer-box">This is strictly developmental and confidential. It is not a psychological assessment, not a performance evaluation, and results are not shared with BIA management or HR in any form.</div>
      <div class="code-field">
        <label for="class-code">Class code</label>
        <input type="text" id="class-code" placeholder="Leave blank unless your facilitator gave you one" value="${escapeHtml(state.code)}">
        <div class="hint">Only needed if your facilitator has set one up.</div>
      </div>
      ${state.error ? `<div class="error-line">${escapeHtml(state.error)}</div>` : ''}
      <button class="begin-btn" id="begin-btn">Begin Session</button>
    </div>`;

  document.getElementById('class-code').addEventListener('input', (e) => {
    state.code = e.target.value;
  });
  document.getElementById('begin-btn').addEventListener('click', beginSession);
}

function renderChat() {
  const visible = state.messages.filter((m) => !m.hidden);

  const messagesHtml = visible
    .map((m) => {
      const roleClass = m.role === 'user' ? 'user' : 'assistant';
      const bubbleId = m.streaming ? ' id="streaming-bubble"' : '';
      const bubbleContent = m.streaming && !m.content
        ? `${icons.spinner} Thinking…`
        : renderMarkdownLite(m.content);
      return `
        <div class="msg-row ${roleClass}">
          <div class="bubble ${roleClass}"${bubbleId}>${bubbleContent}</div>
        </div>`;
    })
    .join('');

  appBody.innerHTML = `
    <div class="chat-screen">
      <div class="messages" id="messages">${messagesHtml}</div>
      ${state.error ? `<div class="error-line">${escapeHtml(state.error)}</div>` : ''}
      <div class="composer">
        <input type="text" id="composer-input" placeholder="Type your response…" value="${escapeHtml(state.input)}" ${state.loading ? 'disabled' : ''}>
        <button class="send-btn" id="send-btn" ${state.loading ? 'disabled' : ''}>Send</button>
      </div>
      <div class="footer-row">
        <button class="restart-link" id="restart-btn">Restart session</button>
        <div class="session-note">Nothing is stored — refreshing starts a new session.</div>
      </div>
    </div>`;

  const messagesEl = document.getElementById('messages');
  messagesEl.scrollTop = messagesEl.scrollHeight;

  const input = document.getElementById('composer-input');
  if (!state.loading) {
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  }
  input.addEventListener('input', (e) => {
    state.input = e.target.value;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('restart-btn').addEventListener('click', restart);
}

function render() {
  state.started ? renderChat() : renderGate();
}

render();
