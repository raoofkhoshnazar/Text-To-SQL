const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const conversation = document.querySelector('#conversation');
const status = document.querySelector('#status');

status.textContent = 'کاملاً استاتیک';

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' })[character]);
}

function dateRange(message) {
  const dates = message.match(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g) || [];
  return [dates[0]?.replaceAll('/', '-') || 'YYYY-MM-DD', dates[1]?.replaceAll('/', '-') || 'YYYY-MM-DD'];
}

function generateQuery(message) {
  const text = message.toLowerCase();
  const [start, end] = dateRange(message);
  const assumptions = [
    'موتور هدف ClickHouse است؛ هیچ اتصالی از این صفحه برقرار نمی‌شود.',
    'بازهٔ زمانی نیمه‌باز است و پایان بازه شامل نمی‌شود.',
    'مبلغ خروجی به تومان تبدیل می‌شود.',
  ];
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
ORDER BY CD.vertical, V.status, CD.category;`, assumptions };
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
ORDER BY month, CD.vertical;`, assumptions };
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
ORDER BY month, CD.vertical, O.payment_method_type;`, assumptions: [...assumptions, 'فقط سفارش‌های موفق ONLINE در Commercial اصلی گزارش می‌شوند.'] };
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
ORDER BY month;`, assumptions };
  }
  return { title: 'نیاز به شفاف‌سازی', sql: '', assumptions: [
    'هدف گزارش را مشخص کنید: فروش، کاربران فعال، کاربران جدید یا وضعیت مرچنت‌ها.',
    'بازهٔ زمانی را با دو تاریخ مثل 2026-01-01 تا 2026-02-01 اعلام کنید.',
  ] };
}

function addMessage(text, kind) {
  const item = document.createElement('article');
  item.className = `message ${kind}`;
  item.textContent = text;
  conversation.appendChild(item);
  item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function addResult(data) {
  const item = document.createElement('article');
  item.className = 'message result';
  const assumptions = data.assumptions.map((value) => `<li>${escapeHtml(value)}</li>`).join('');
  item.innerHTML = `<h3>${escapeHtml(data.title)}</h3>${data.sql ? `<div class="code-wrap"><pre>${escapeHtml(data.sql)}</pre><button class="copy-button" type="button">کپی SQL</button></div>` : ''}<p><strong>فرض‌ها و نکات</strong></p><ul>${assumptions}</ul>`;
  if (data.sql) {
    item.querySelector('.copy-button').addEventListener('click', async (event) => {
      await navigator.clipboard.writeText(data.sql);
      event.currentTarget.textContent = 'کپی شد';
      setTimeout(() => { event.currentTarget.textContent = 'کپی SQL'; }, 1500);
    });
  }
  conversation.appendChild(item);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  addMessage(message, 'user');
  input.value = '';
  const button = form.querySelector('button');
  button.disabled = true;
  addResult(generateQuery(message));
  button.disabled = false;
});
