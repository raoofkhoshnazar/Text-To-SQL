const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const conversation = document.querySelector('#conversation');
const status = document.querySelector('#status');

function addMessage(text, kind) {
  const item = document.createElement('article');
  item.className = `message ${kind}`;
  item.textContent = text;
  conversation.appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[character]);
}

function addResult(data) {
  const item = document.createElement('article');
  item.className = 'message result';
  const assumptions = data.assumptions.map((value) => `<li>${escapeHtml(value)}</li>`).join('');
  const context = data.context.length ? `<p><strong>بخش‌های مرتبط از راهنما</strong></p><ul>${data.context.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : '';
  item.innerHTML = `<h3>${escapeHtml(data.title)}</h3>${data.sql ? `<pre>${escapeHtml(data.sql)}</pre>` : ''}<p><strong>فرض‌ها و نکات</strong></p><ul>${assumptions}</ul>${context}`;
  conversation.appendChild(item);
}

fetch('/api/health').then((response) => response.json()).then((data) => {
  status.textContent = data.knowledge === 'loaded' ? 'راهنما متصل است' : 'راهنما نصب نشده';
}).catch(() => { status.textContent = 'آفلاین'; });

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, 'user');
  input.value = '';
  form.querySelector('button').disabled = true;
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    if (!response.ok) throw new Error('request failed');
    addResult(await response.json());
  } catch {
    addMessage('در ارتباط با دستیار خطایی رخ داد. دوباره تلاش کنید.', 'assistant');
  } finally {
    form.querySelector('button').disabled = false;
  }
});
