const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const conversation = document.querySelector('#conversation');
const outputEmpty = document.querySelector('#output-empty');
const outputContent = document.querySelector('#output-content');
const queryTitle = document.querySelector('#query-title');
const queryCode = document.querySelector('#query-code');
const assumptionsList = document.querySelector('#assumptions');
const metaCount = document.querySelector('#meta-count');
const copyMain = document.querySelector('#copy-main');
let currentSql = '';
let knowledgeGuide = '';
const apiConfig = JSON.parse(localStorage.getItem('text2sql-api') || '{}');

fetch('./knowledge/commercial_database_query_guide.md').then((response) => response.ok ? response.text() : '').then((text) => { knowledgeGuide = text; }).catch(() => {});

const knowledge = {
  source: 'commercial_database_query_guide.md',
  engine: 'ClickHouse',
  rules: [
    'بازهٔ تاریخ همیشه نیمه‌باز است.',
    'مبلغ خام ریال و خروجی مالی تومان است؛ تبدیل با / 10 انجام می‌شود.',
    'سفارش موفق با status = SETTLE تعریف می‌شود.',
    'در گزارش Commercial اصلی merchant_type = ONLINE و حذف Snapp-Venture فقط در صورت درخواست اعمال می‌شود.',
    'برای سفارش uniqExact(order_id) و برای کاربر uniqExact(wallet_id) استفاده می‌شود.',
  ],
};

async function callConfiguredModel(message) {
  if (!apiConfig.baseUrl || !apiConfig.apiKey || !apiConfig.model) return null;
  const baseUrl = apiConfig.baseUrl.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiConfig.apiKey}` },
    body: JSON.stringify({
      model: apiConfig.model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: `تو دستیار Text2SQL سازمانی هستی. فقط بر اساس راهنمای زیر پاسخ بده. خروجی را JSON معتبر با فیلدهای title، sql و assumptions بده. SQL باید فقط SELECT یا CTE باشد و هرگز دستور تغییر داده تولید نکن. اگر نیاز مبهم است sql را خالی بگذار و سؤال تکمیلی در assumptions بنویس.\n\n${knowledgeGuide}` },
        { role: 'user', content: message },
      ],
    }),
  });
  if (!response.ok) throw new Error(`model request failed: ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const clean = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const result = JSON.parse(clean);
  if (typeof result.sql !== 'string' || !Array.isArray(result.assumptions)) throw new Error('invalid model response');
  return result;
}

function setApiStatus(text, error = false) {
  const element = document.querySelector('#api-status');
  element.textContent = text;
  element.classList.toggle('error', error);
}

function loadApiForm() {
  document.querySelector('#api-base').value = apiConfig.baseUrl || '';
  document.querySelector('#api-key').value = apiConfig.apiKey || '';
  document.querySelector('#api-model').value = apiConfig.model || '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[character]);
}

function dateRange(message) {
  const dates = message.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g) || [];
  return [dates[0]?.replaceAll('/', '-') || 'YYYY-MM-DD', dates[1]?.replaceAll('/', '-') || 'YYYY-MM-DD'];
}

function baseAssumptions(extra = []) {
  return [...knowledge.rules.slice(0, 3), ...extra];
}

function generateQuery(message) {
  const text = message.toLowerCase();
  const [start, end] = dateRange(message);
  if ((text.includes('مرچنت') || text.includes('merchant') || text.includes('ونچر') || text.includes('venture')) && (text.includes('وضعیت') || text.includes('status'))) {
    return { title: 'وضعیت مرچنت‌ها به تفکیک ورتیکال و دسته', sql: `SELECT
    CD.vertical,
    V.status,
    CD.account_manager,
    CD.category,
    uniqExact(V.id) AS ventures
FROM fms_credit.tbl_venture AS V
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(V.id)
GROUP BY CD.vertical, V.status, CD.account_manager, CD.category
ORDER BY CD.vertical, V.status, CD.category;`, assumptions: ['سطح خروجی: ونچر، ورتیکال، وضعیت، مدیر و دسته.', ...baseAssumptions()] };
  }
  if (text.includes('کاربر فعال') || text.includes('active user') || text.includes('فعال ماهانه')) {
    return { title: 'کاربران فعال ماهانه', sql: `SELECT
    toStartOfMonth(O.registered_date) AS month,
    CD.vertical,
    uniqExact(O.wallet_id) AS active_users
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
WHERE O.status = 'SETTLE'
  AND O.merchant_type = 'ONLINE'
  AND O.registered_date >= toDate('${start}')
  AND O.registered_date < toDate('${end}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY month, CD.vertical
ORDER BY month, CD.vertical;`, assumptions: ['سطح خروجی: ماه و ورتیکال.', 'تعریف کاربر: wallet_id یکتا.', ...baseAssumptions()] };
  }
  if (text.includes('کاربر جدید') || text.includes('new user') || text.includes('ثبت‌نام کاربر')) {
    return { title: 'کاربران جدید بر اساس اولین سفارش موفق', sql: `WITH first_user_order AS
(
    SELECT
        O.wallet_id,
        min(O.registered_date) AS first_order_date
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND CD.vertical != 'Snapp-Venture'
      AND CD.category NOT IN ('in_store', 'social', 'ventures')
    GROUP BY O.wallet_id
)
SELECT
    toStartOfMonth(first_order_date) AS month,
    uniqExact(wallet_id) AS new_users
FROM first_user_order
WHERE first_order_date >= toDate('${start}')
  AND first_order_date < toDate('${end}')
GROUP BY month
ORDER BY month;`, assumptions: ['تعریف کاربر جدید: اولین سفارش موفق در دامنهٔ Commercial.', ...baseAssumptions()] };
  }
  if (text.includes('آیتم') || text.includes('محصول') || text.includes('item') || text.includes('top')) {
    return { title: 'بیست آیتم پرفروش هر مرچنت', sql: `WITH ranked_items AS
(
    SELECT
        V.name AS merchant_name,
        CIWP.name AS item_name,
        CIWP.predicted_category,
        CI.category AS item_category,
        sum(CIWP.count) AS item_count,
        row_number() OVER
        (
            PARTITION BY V.name
            ORDER BY sum(CIWP.count) DESC
        ) AS item_rank
    FROM fms_credit.tbl_order AS O
    INNER JOIN fms_credit.tbl_venture AS V ON V.id = O.venture_id
    INNER JOIN fms_credit.tbl_cart AS C ON C.order_id = O.id
    INNER JOIN fms_credit.tbl_cart_item AS CI ON CI.cart_id = C.id
    INNER JOIN ds_services.cart_item_with_prediction AS CIWP ON CIWP.cart_id = C.id
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND O.registered_date >= toDate('${start}')
      AND O.registered_date < toDate('${end}')
      AND CI.count < 100
    GROUP BY merchant_name, item_name, predicted_category, item_category
)
SELECT * FROM ranked_items WHERE item_rank <= 20
ORDER BY merchant_name, item_rank;`, assumptions: ['سطح خروجی: آیتم و مرچنت.', 'برای جلوگیری از شمارش غیرواقعی، CI.count کمتر از 100 است.', ...baseAssumptions()] };
  }
  if (text.includes('فروش') || text.includes('gmv') || text.includes('فروش ناخالص') || text.includes('sales')) {
    return { title: 'فروش ناخالص، سفارش و هزینهٔ ووچر', sql: `SELECT
    toStartOfMonth(O.registered_date) AS month,
    CD.vertical,
    O.payment_method_type,
    uniqExact(O.id) AS orders,
    sum(O.amount) / 10 AS gross_gmv_toman,
    sum(coalesce(O.voucher_discount_amount, 0)) / 10 AS voucher_cost_toman
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
WHERE O.status = 'SETTLE'
  AND O.merchant_type = 'ONLINE'
  AND O.registered_date >= toDate('${start}')
  AND O.registered_date < toDate('${end}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY month, CD.vertical, O.payment_method_type
ORDER BY month, CD.vertical, O.payment_method_type;`, assumptions: ['سطح خروجی: ماه، ورتیکال و روش پرداخت.', ...baseAssumptions(['سفارش‌های موفق ONLINE در Commercial اصلی گزارش می‌شوند.'])] };
  }
  return { title: 'نیاز به شفاف‌سازی', sql: '', assumptions: ['هدف گزارش را مشخص کنید: فروش، کاربران فعال، کاربران جدید، آیتم یا وضعیت مرچنت‌ها.', 'بازهٔ زمانی را با دو تاریخ مثل 2026-01-01 تا 2026-02-01 اعلام کنید.', 'راهنمای Commercial برای تولید پاسخ استفاده می‌شود؛ اجرای دیتابیس از این برنامه ممکن نیست.'] };
}

function appendUserMessage(text) {
  const item = document.createElement('article');
  item.className = 'user-message';
  item.innerHTML = `<span class="message-avatar">شما</span><div>${escapeHtml(text)}</div>`;
  conversation.appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showOutput(result) {
  currentSql = result.sql;
  outputEmpty.classList.toggle('hidden', Boolean(result.sql));
  outputContent.classList.toggle('hidden', !result.sql);
  if (!result.sql) return;
  queryTitle.textContent = result.title;
  queryCode.textContent = result.sql;
  metaCount.textContent = `${result.assumptions.length} مورد`;
  assumptionsList.innerHTML = result.assumptions.map((value) => `<li>${escapeHtml(value)}</li>`).join('');
}

function appendAssistantMessage(result) {
  const item = document.createElement('article');
  item.className = 'assistant-message';
  item.innerHTML = `<span class="message-avatar ai-avatar">✦</span><div><strong>${escapeHtml(result.title)}</strong><p>${result.sql ? 'کوئری در پنل خروجی آماده شد. فرضیات را بررسی و SQL را کپی کن.' : escapeHtml(result.assumptions.join(' '))}</p></div>`;
  conversation.appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function copyText(text, button) {
  await navigator.clipboard.writeText(text);
  const original = button.innerHTML;
  button.innerHTML = 'کپی شد ✓';
  setTimeout(() => { button.innerHTML = original; }, 1500);
}

copyMain.addEventListener('click', () => { if (currentSql) copyText(currentSql, copyMain); });
document.querySelector('#clear-output').addEventListener('click', () => { currentSql = ''; outputEmpty.classList.remove('hidden'); outputContent.classList.add('hidden'); });
document.querySelector('#new-chat').addEventListener('click', () => { conversation.innerHTML = ''; currentSql = ''; outputEmpty.classList.remove('hidden'); outputContent.classList.add('hidden'); input.focus(); });
document.querySelectorAll('.suggestion').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.prompt; input.focus(); }));
document.querySelector('#examples-nav').addEventListener('click', () => { document.querySelector('.suggestion').scrollIntoView({ behavior: 'smooth' }); });
document.querySelector('#settings-button').addEventListener('click', () => { loadApiForm(); document.querySelector('#settings-backdrop').classList.remove('hidden'); });
document.querySelector('#close-settings').addEventListener('click', () => document.querySelector('#settings-backdrop').classList.add('hidden'));
document.querySelector('#settings-backdrop').addEventListener('click', (event) => { if (event.target.id === 'settings-backdrop') event.currentTarget.classList.add('hidden'); });
document.querySelector('#save-api').addEventListener('click', () => {
  apiConfig.baseUrl = document.querySelector('#api-base').value.trim();
  apiConfig.apiKey = document.querySelector('#api-key').value.trim();
  apiConfig.model = document.querySelector('#api-model').value.trim();
  localStorage.setItem('text2sql-api', JSON.stringify(apiConfig));
  setApiStatus('تنظیمات در همین مرورگر ذخیره شد.');
});
document.querySelector('#test-api').addEventListener('click', async () => {
  try { await callConfiguredModel('یک پاسخ کوتاه برای تست اتصال بده.'); setApiStatus('اتصال موفق بود.'); }
  catch (error) { setApiStatus(`اتصال ناموفق: ${error.message}`, true); }
});
loadApiForm();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  appendUserMessage(message);
  input.value = '';
  const button = form.querySelector('.send-button');
  button.disabled = true;
  button.style.opacity = '.55';
  try {
    const result = await callConfiguredModel(message) || generateQuery(message);
    showOutput(result);
    appendAssistantMessage(result);
  } catch (error) {
    const fallback = generateQuery(message);
    fallback.assumptions.unshift(`مدل تنظیم‌شده پاسخ نداد؛ خروجی محلی استفاده شد (${error.message}).`);
    showOutput(fallback);
    appendAssistantMessage(fallback);
  } finally {
    button.disabled = false;
    button.style.opacity = '';
  }
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
});
