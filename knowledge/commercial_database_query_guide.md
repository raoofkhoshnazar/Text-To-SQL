# راهنمای کامل دیتابیس و کوئری‌های Commercial

## ۱. هدف و دامنه

این سند بر اساس دو منبع زیر تهیه شده است:

- فایل داکیومنت کوئری‌های عملیاتی و تحلیلی Commercial
- فایل اکسل `commercial-important-query-.xlsx` شامل شیت‌های `Join`، `Other`، `app log`، `Target & Run Rate` و `KPI`

هدف سند، ایجاد یک مرجع قابل استفاده برای تحلیلگر یا دستیار هوش مصنوعی است تا بتواند کوئری‌های Commercial را با الگوی یکسان، قابل ممیزی و قابل تغییر تولید کند.

> این سند فقط بر اساس ساختار جداول و کوئری‌های ارائه‌شده تهیه شده است. قواعد کسب‌وکاری اعلام‌شده در ادامه قطعی هستند؛ فقط ابهام‌های فنی اجرای SQL و نوع دقیق ستون‌ها باید در محیط دیتابیس اعتبارسنجی شود.

---

## ۲. موتور و قواعد عمومی

موتور کوئری‌ها ClickHouse است و از توابعی مانند `toStartOfMonth`، `toDate`، `dateDiff`، `uniqExact`، `countIf`، `sumIf`، `leadInFrame` و `lagInFrame` استفاده می‌شود.

### پارامترهای استاندارد

در کوئری‌های جدید، تاریخ‌ها را به شکل نیمه‌باز استفاده کن:

```sql
registered_date >= {{start_date}}
AND registered_date <  {{end_date}}
```

نمونه:

```sql
registered_date >= toDate('2026-01-01')
AND registered_date <  toDate('2027-01-01')
```

پارامترهای رایج:

| پارامتر | کاربرد |
|---|---|
| `{{start_date}}` | شروع بازه، شامل |
| `{{end_date}}` | پایان بازه، غیرشامل |
| `{{target_month}}` | ماه هدف به‌صورت اولین روز ماه |
| `{{venture_id}}` | شناسه ونچر |
| `{{vertical}}` | ورتیکال |
| `{{merchant_type}}` | نوع مرچنت |
| `{{payment_method}}` | روش پرداخت |
| `{{lookback_days}}` | پنجرهٔ بازگشت یا تبدیل |

### فیلتر استاندارد Commercial آنلاین

فیلترهای Commercial ثابت نیستند و باید بر اساس درخواست گزارش تعیین شوند:

```sql
O.status = 'SETTLE'
AND O.merchant_type = 'ONLINE'
```

فیلترهای زیر فقط زمانی اعمال شوند که درخواست، Commercial اصلی بدون Snapp-Venture و دسته‌های خارج از مدل را بخواهد:

```sql
CD.vertical != 'Snapp-Venture'
AND CD.category NOT IN ('in_store', 'social', 'ventures')
```

در گزارش‌هایی که عمداً همهٔ وضعیت‌ها، همهٔ انواع مرچنت، Snapp-Venture یا دسته‌های خارج از مدل را می‌خواهند، این فیلترها نباید به‌صورت خودکار اضافه شوند.

### تعریف قطعی مبلغ و زمان

- Gross GMV از `fms_credit.tbl_order.amount` محاسبه می‌شود.
- واحد خام همهٔ فیلدهای مبلغ ریال است.
- همهٔ مبالغ خروجی باید به تومان تبدیل شوند:

```sql
amount_toman = amount / 10
```

- تاریخ مبنای سفارش هنوز انتخاب نشده و باید در ابتدای هر کوئری مشخص شود: `registered_date`، `created_date` یا `registered_at`.
- وضعیت سفارش موفق فقط `SETTLE` است.
- وضعیت `deleted_at` در گزارش فروش هنوز تعیین نشده و باید به‌عنوان پارامتر گزارش مشخص شود.
- سفارش ارگانیک زمانی است که `voucher_discount_amount` صفر یا خالی باشد؛ وجود `discount_amount` بدون ووچر، سفارش را غیرارگانیک نمی‌کند.
- هزینهٔ ووچر از `voucher_discount_amount` محاسبه می‌شود.

### نگاشت Payment Method

| مقدار دیتابیس | گروه گزارش |
|---|---|
| `INSTALLMENT` | Installment؛ خرید چهار قسطه |
| `POSTPAID` | Post Paid؛ پرداخت آخر ماه |
| `FINANCING` | Financial؛ وام |
| `PAY_NOW` | PayNow؛ کش‌بک |
| `WALLET` | گروه مستقل |
| `PAY_PRO` | گروه مستقل |
| خالی یا ناشناخته | نگه‌داری در گزارش کنترل کیفیت |

فهرست Verticalهای نهایی:

```text
FMCG, H&B, Home, Gold, Digital, Fashion, Services
```

---

## ۳. کاتالوگ جداول

### ۳.۱ `fms_credit.tbl_order` با نام مستعار `O` یا `t`

جدول اصلی سفارش.

ستون‌های استفاده‌شده در منابع:

| ستون | کاربرد |
|---|---|
| `id` | شناسه سفارش |
| `venture_id` | شناسه مرچنت/ونچر |
| `wallet_id` | شناسه کاربر در سطح کیف پول |
| `transaction_id` | شناسه تراکنش برای گزارش مرچنت |
| `status` | وضعیت سفارش؛ مقدار موفق در منابع `SETTLE` است |
| `merchant_type` | مانند `ONLINE`، `SOCIAL`، `IN_STORE_QR` |
| `payment_method_type` | مانند `INSTALLMENT`، `POSTPAID`، `PAY_NOW`، `FINANCING`، `WALLET`، `PAY_PRO` |
| `registered_at` / `registered_date` | زمان یا تاریخ ثبت سفارش |
| `created_at` / `created_date` | زمان یا تاریخ ایجاد رکورد |
| `amount` | مبلغ سفارش؛ واحد باید تأیید شود |
| `discount_amount` | مبلغ کل تخفیف |
| `voucher_discount_amount` | مبلغ تخفیف ووچر |
| `deleted_at` | حذف نرم سفارش |

نکته: `registered_date`، `created_date` و `registered_at` در منابع هم‌زمان استفاده شده‌اند و تاریخ مبنای سفارش هنوز انتخاب نشده است. هر کوئری باید فیلد تاریخ مبنا را صریحاً اعلام کند. `created_date` می‌تواند برای محدودسازی partition نیز جداگانه استفاده شود، اما جایگزین تاریخ مبنای KPI نیست مگر با تأیید درخواست گزارش.

در صورت نیاز به محاسبهٔ اولین کاربر، شناسهٔ اصلی `wallet_id` است. اولین سفارش موفق کاربر در کل Commercial تعیین می‌شود، با این دامنه: همهٔ Verticalها و Snapp-Venture، به‌جز سفارش‌های `SOCIAL` و `IN_STORE`/`IN_STORE_QR`. وضعیت ارگانیک کاربر بر اساس ووچر در همان اولین سفارش موفق تعیین می‌شود و به‌عنوان ویژگی ثابت کاربر باقی می‌ماند.

### ۳.۲ `fms_credit.tbl_venture` با نام مستعار `V` یا `tv`

اطلاعات ونچر/مرچنت.

ستون‌های استفاده‌شده:

- `id`
- `name`
- `status`
- `callback_url`
- `created_date`
- `pay_now_access`
- `cashback_percentage`

### ۳.۳ `minio_db.commercial_data` با نام مستعار `CD` یا `cd`

جدول دیکشنری Commercial و نگاشت ونچر به ویژگی‌های کسب‌وکار.

ستون‌های استفاده‌شده:

- `venture_id`
- `merchant_name`
- `vertical`
- `category`
- `account_manager`
- `source`

اتصال استاندارد:

```sql
ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
```

یا:

```sql
ON toUInt64(CD.venture_id) = toUInt64(V.id)
```

پیش از تحلیل، یکتا بودن `commercial_data.venture_id` را بررسی کن. طبق قاعدهٔ فعلی، اگر برای یک `venture_id` چند ردیف وجود داشته باشد، جدیدترین ردیف معتبر است؛ بنابراین باید با ستون زمان‌دار واقعی همان جدول انتخاب شود. هر `venture_id` باید فقط یک `merchant_name`، `vertical`، `category`، `source` و `account_manager` داشته باشد. اگر این شرط نقض شود، گزارش کنترل کیفیت باید آن را نشان دهد و join ساده نباید باعث چندبرابرشدن سفارش و مبلغ شود.

### ۳.۴ جداول سبد و آیتم

```text
fms_credit.tbl_cart       AS C
fms_credit.tbl_cart_item  AS CI
```

اتصال:

```sql
C.order_id = O.id
CI.cart_id = C.id
```

برای تحلیل محصول و پیش‌بینی دسته‌بندی:

```text
ds_services.cart_item_with_prediction AS CIWP
```

اتصال:

```sql
CIWP.cart_id = C.id
```

### ۳.۵ `public.DimDate_Persian`

جدول تقویم فارسی.

اتصال در منابع:

```sql
ON DDP.DateSk = toYYYYMMDD(O.created_at)
```

ستون‌های استفاده‌شده:

- `DateSk`
- `YearMonth`
- `PersianCalendar`

### ۳.۶ `fms_credit_warehoues.tbl_registration`

منبع داشبورد ثبت‌نام مرچنت.

### ۳.۷ جداول سیاست تسویه

```text
fms_credit_warehoues.tbl_registration_settlement_policy AS TRSP
fms_credit_warehoues.tbl_settlement_policy AS TSP
```

اتصال:

```sql
TRSP.settlement_policy_id = TSP.id
```

### ۳.۸ لاگ محصول

```text
app_log.events
app_log.raw_events
```

ستون‌های استفاده‌شده:

- `event_name`
- `wallet_id`
- `venture_id`
- `venture_name`
- `created_at`
- `created_date`
- `app`
- `payload`

برای استخراج فیلدهای JSON:

```sql
JSONExtractString(toString(payload), 'Product_Name')
```

---

## ۴. الگوهای اتصال معتبر

### سفارش، ونچر و دادهٔ Commercial

```sql
FROM fms_credit.tbl_order AS O
INNER JOIN fms_credit.tbl_venture AS V
    ON V.id = O.venture_id
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
```

### سفارش، سبد و آیتم

```sql
FROM fms_credit.tbl_order AS O
INNER JOIN fms_credit.tbl_cart AS C
    ON C.order_id = O.id
INNER JOIN fms_credit.tbl_cart_item AS CI
    ON CI.cart_id = C.id
```

### سفارش و تقویم فارسی

```sql
LEFT JOIN public.DimDate_Persian AS DDP
    ON DDP.DateSk = toYYYYMMDD(O.created_at)
```

### لاگ و Commercial

```sql
FROM app_log.events AS E
LEFT JOIN minio_db.commercial_data AS CD
    ON E.venture_name = CD.merchant_name
```

در صورت امکان، اتصال لاگ به Commercial را با `venture_id` انجام بده؛ اتصال با نام مرچنت به دلیل تفاوت حروف، فاصله، نام‌های تکراری و تغییر نام شکننده‌تر است.

---

## ۵. کوئری‌های مرجع تحلیلی

## ۵.۱ وضعیت مرچنت‌ها به تفکیک ورتیکال و دسته

```sql
SELECT
    CD.vertical,
    V.status,
    CD.account_manager,
    CD.category,
    uniqExact(V.id) AS ventures
FROM fms_credit.tbl_venture AS V
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(V.id)
GROUP BY
    CD.vertical,
    V.status,
    CD.account_manager,
    CD.category
ORDER BY
    CD.vertical,
    V.status,
    CD.category;
```

## ۵.۲ مرچنت‌های آنلاین تازه‌فعال‌شده در یک بازه

```sql
SELECT
    V.name,
    V.callback_url,
    O.venture_id,
    min(O.registered_at) AS first_online_order_at
FROM fms_credit.tbl_order AS O
INNER JOIN fms_credit.tbl_venture AS V
    ON O.venture_id = V.id
WHERE O.merchant_type = 'ONLINE'
GROUP BY
    V.name,
    V.callback_url,
    O.venture_id
HAVING
    first_online_order_at >= toDateTime('{{start_date}} 00:00:00')
    AND first_online_order_at < toDateTime('{{end_date}} 00:00:00')
ORDER BY first_online_order_at;
```

## ۵.۳ وضعیت PayNow مرچنت‌ها

```sql
SELECT
    V.name,
    V.id,
    V.callback_url,
    multiIf(
        V.pay_now_access = 1, concat(toString(V.cashback_percentage), '%'),
        V.pay_now_access = 0, 'Excluded',
        isNull(V.pay_now_access), 'Not_Activated',
        'Unknown'
    ) AS paynow_status
FROM fms_credit.tbl_venture AS V
ORDER BY V.name;
```

## ۵.۴ نوع مرچنت‌هایی که هر ونچر داشته است

این گزارش عمداً موفق یا ناموفق بودن سفارش را فیلتر نمی‌کند.

```sql
SELECT
    V.name AS venture_name,
    V.id AS venture_id,
    V.category,
    max(if(O.merchant_type = 'ONLINE', 1, 0)) AS has_online,
    max(if(O.merchant_type = 'SOCIAL', 1, 0)) AS has_social,
    max(if(O.merchant_type = 'IN_STORE_QR', 1, 0)) AS has_in_store_qr
FROM fms_credit.tbl_venture AS V
LEFT JOIN fms_credit.tbl_order AS O
    ON O.venture_id = V.id
WHERE V.created_date >= toDate('{{start_date}}')
GROUP BY
    V.name,
    V.id,
    V.category
ORDER BY V.name;
```

## ۵.۵ مرچنت‌های جدید بر اساس اولین سفارش موفق

```sql
WITH first_orders AS
(
    SELECT
        O.venture_id,
        CD.vertical,
        CD.category,
        CD.source,
        min(O.registered_date) AS first_order_date
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND CD.vertical != 'Snapp-Venture'
      AND CD.category NOT IN ('in_store', 'social', 'ventures')
    GROUP BY
        O.venture_id,
        CD.vertical,
        CD.category,
        CD.source
)
SELECT
    toYear(first_order_date) AS year,
    toMonth(first_order_date) AS month,
    vertical,
    category,
    source,
    uniqExact(venture_id) AS new_active_merchants
FROM first_orders
WHERE first_order_date >= toDate('{{start_date}}')
  AND first_order_date < toDate('{{end_date}}')
GROUP BY
    year,
    month,
    vertical,
    category,
    source
ORDER BY year, month, vertical, category, source;
```

## ۵.۶ سفارش، آیتم، تعداد و NMV

به دلیل join شدن سفارش به آیتم، شمارش سفارش باید با شناسهٔ سفارش یکتا انجام شود.

```sql
SELECT
    CD.vertical,
    CD.category,
    toStartOfMonth(O.registered_date) AS month,
    O.status,
    uniqExact(O.id) AS orders,
    sum(CI.count) AS quantity,
    sum(CI.amount) AS nmv_raw,
    round(sum(CI.count) / nullIf(uniqExact(O.id), 0), 2) AS avg_item_per_order,
    CD.source
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
INNER JOIN fms_credit.tbl_cart AS C
    ON C.order_id = O.id
INNER JOIN fms_credit.tbl_cart_item AS CI
    ON CI.cart_id = C.id
WHERE O.status = 'SETTLE'
  AND O.merchant_type = 'ONLINE'
  AND O.registered_date >= toDate('{{start_date}}')
  AND O.registered_date < toDate('{{end_date}}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
  AND CI.count < 100
GROUP BY
    CD.vertical,
    CD.category,
    month,
    O.status,
    CD.source
ORDER BY month, CD.vertical, CD.category;
```

## ۵.۷ فروش ناخالص، تخفیف و ووچر

```sql
SELECT
    CD.vertical,
    CD.category,
    toStartOfMonth(O.registered_date) AS month,
    O.status,
    O.payment_method_type,
    CD.source,
    O.discount_amount > 0 AS has_discount,
    O.voucher_discount_amount > 0 AS has_voucher,
    O.deleted_at IS NOT NULL AS deleted,
    uniqExact(O.id) AS orders,
    sum(O.amount) AS amount_raw,
    sum(O.discount_amount) AS discount_amount_raw,
    sum(O.voucher_discount_amount) AS voucher_discount_amount_raw
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
WHERE O.registered_date >= toDate('{{start_date}}')
  AND O.registered_date < toDate('{{end_date}}')
  AND O.merchant_type = 'ONLINE'
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY
    CD.vertical,
    CD.category,
    month,
    O.status,
    O.payment_method_type,
    CD.source,
    has_discount,
    has_voucher,
    deleted
ORDER BY month, CD.vertical, CD.category;
```

برای مدل BNPL، سفارش موفق و ووچر باید جداگانه استخراج شوند:

```sql
SELECT
    toStartOfMonth(O.registered_date) AS month,
    CD.vertical,
    O.payment_method_type,
    uniqExact(O.id) AS orders,
    uniqExact(O.wallet_id) AS users,
    uniqExactIf(O.id, coalesce(O.voucher_discount_amount, 0) = 0) AS organic_orders,
    uniqExactIf(O.id, coalesce(O.voucher_discount_amount, 0) > 0) AS non_organic_orders,
    sum(O.amount) AS gross_gmv_raw,
    sumIf(O.voucher_discount_amount, O.voucher_discount_amount > 0) AS voucher_cost_raw
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
WHERE O.status = 'SETTLE'
  AND O.merchant_type = 'ONLINE'
  AND O.registered_date >= toDate('{{start_date}}')
  AND O.registered_date < toDate('{{end_date}}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY month, CD.vertical, O.payment_method_type;
```

## ۵.۸ کاربران جدید

در این نسخه، کاربر در سطح `wallet_id` و با اولین سفارش موفق تعریف می‌شود.

```sql
WITH first_user_order AS
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
WHERE first_order_date >= toDate('{{start_date}}')
  AND first_order_date < toDate('{{end_date}}')
GROUP BY month
ORDER BY month;
```

## ۵.۹ کاربران فعال ماهانه

```sql
SELECT
    toStartOfMonth(O.registered_date) AS month,
    CD.vertical,
    uniqExact(O.wallet_id) AS active_users
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
WHERE O.status = 'SETTLE'
  AND O.merchant_type = 'ONLINE'
  AND O.registered_date >= toDate('{{start_date}}')
  AND O.registered_date < toDate('{{end_date}}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY month, CD.vertical
ORDER BY month, CD.vertical;
```

## ۵.۱۰ کاربران بازگشتی ماهانه

```sql
WITH monthly_users AS
(
    SELECT DISTINCT
        O.wallet_id,
        CD.vertical,
        toStartOfMonth(O.registered_date) AS month
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND CD.vertical != 'Snapp-Venture'
      AND CD.category NOT IN ('in_store', 'social', 'ventures')
),
first_month AS
(
    SELECT wallet_id, vertical, min(month) AS first_month
    FROM monthly_users
    GROUP BY wallet_id, vertical
)
SELECT
    U.month,
    U.vertical,
    uniqExactIf(U.wallet_id, U.month > F.first_month) AS returning_users
FROM monthly_users AS U
INNER JOIN first_month AS F
    ON F.wallet_id = U.wallet_id
   AND F.vertical = U.vertical
WHERE U.month >= toStartOfMonth(toDate('{{start_date}}'))
  AND U.month < toStartOfMonth(toDate('{{end_date}}'))
GROUP BY U.month, U.vertical
ORDER BY U.month, U.vertical;
```

## ۵.۱۱ کاربران ارگانیک و غیرارگانیک در اولین سفارش

این گزارش فقط وضعیت اولین سفارش کاربر را تعیین می‌کند و با وضعیت هر سفارش یکی نیست.

```sql
WITH first_user_order AS
(
    SELECT
        O.wallet_id,
        argMin(O.registered_date, O.registered_date) AS first_order_date,
        argMin(coalesce(O.voucher_discount_amount, 0), O.registered_date) AS first_voucher_discount
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
    uniqExactIf(wallet_id, first_voucher_discount = 0) AS organic_new_users,
    uniqExactIf(wallet_id, first_voucher_discount > 0) AS non_organic_new_users
FROM first_user_order
WHERE first_order_date >= toDate('{{start_date}}')
  AND first_order_date < toDate('{{end_date}}')
GROUP BY month
ORDER BY month;
```

## ۵.۱۲ فاصلهٔ سفارش‌های کاربر

```sql
WITH orders AS
(
    SELECT
        O.wallet_id,
        CD.vertical,
        O.registered_date AS order_date,
        lagInFrame(O.registered_date) OVER
        (
            PARTITION BY O.wallet_id, CD.vertical
            ORDER BY O.registered_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS previous_order_date
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND CD.vertical != 'Snapp-Venture'
      AND CD.category NOT IN ('in_store', 'social', 'ventures')
),
intervals AS
(
    SELECT
        wallet_id,
        vertical,
        toStartOfMonth(order_date) AS month,
        dateDiff('day', previous_order_date, order_date) AS days_between_orders
    FROM orders
    WHERE previous_order_date IS NOT NULL
)
SELECT
    month,
    vertical,
    round(avg(days_between_orders), 2) AS avg_user_order_interval_days
FROM intervals
WHERE month >= toStartOfMonth(toDate('{{start_date}}'))
  AND month < toStartOfMonth(toDate('{{end_date}}'))
GROUP BY month, vertical
ORDER BY month, vertical;
```

## ۵.۱۳ فاصلهٔ بیش از ۶۰ روز بین سفارش‌ها

```sql
WITH orders AS
(
    SELECT
        O.wallet_id,
        CD.vertical,
        O.registered_date AS order_date,
        lagInFrame(O.registered_date) OVER
        (
            PARTITION BY O.wallet_id, CD.vertical
            ORDER BY O.registered_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS previous_order_date
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND CD.vertical != 'Snapp-Venture'
      AND CD.category NOT IN ('in_store', 'social', 'ventures')
)
SELECT
    toStartOfMonth(previous_order_date) AS month,
    vertical,
    uniqExact(wallet_id) AS users_with_60d_gap
FROM orders
WHERE previous_order_date IS NOT NULL
  AND dateDiff('day', previous_order_date, order_date) > 60
  AND previous_order_date >= toDate('{{start_date}}')
  AND previous_order_date < toDate('{{end_date}}')
GROUP BY month, vertical
ORDER BY month, vertical;
```

## ۵.۱۴ سفارش‌های کوهورت و اولین سفارش

```sql
WITH user_orders AS
(
    SELECT
        O.wallet_id,
        CD.vertical,
        O.payment_method_type,
        toStartOfMonth(O.registered_date) AS activity_month,
        min(toStartOfMonth(O.registered_date)) OVER
        (
            PARTITION BY O.wallet_id
        ) AS cohort_month,
        O.id AS order_id,
        O.amount,
        coalesce(O.voucher_discount_amount, 0) AS voucher_discount_amount
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND CD.vertical != 'Snapp-Venture'
      AND CD.category NOT IN ('in_store', 'social', 'ventures')
)
SELECT
    cohort_month,
    activity_month,
    dateDiff('month', cohort_month, activity_month) AS cohort_age,
    vertical,
    payment_method_type,
    uniqExact(wallet_id) AS active_users,
    uniqExact(order_id) AS orders,
    sum(amount) AS gross_gmv_raw,
    uniqExactIf(order_id, voucher_discount_amount = 0) AS organic_orders,
    uniqExactIf(order_id, voucher_discount_amount > 0) AS non_organic_orders
FROM user_orders
WHERE activity_month >= toStartOfMonth(toDate('{{start_date}}'))
  AND activity_month < toStartOfMonth(toDate('{{end_date}}'))
GROUP BY
    cohort_month,
    activity_month,
    cohort_age,
    vertical,
    payment_method_type;
```

---

## ۶. کوئری‌های رشد و رتبه‌بندی مرچنت

### پنج مرچنت لانگ‌تیل با رشد یکنواخت در شش ماه اول

```sql
WITH first_month AS
(
    SELECT
        toUInt64(O.venture_id) AS venture_id,
        CD.vertical,
        toStartOfMonth(min(O.registered_date)) AS first_month
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.payment_method_type != 'PAY_PRO'
      AND O.status = 'SETTLE'
      AND CD.account_manager = 'long-tail'
    GROUP BY venture_id, CD.vertical
),
monthly_orders AS
(
    SELECT
        F.venture_id,
        F.vertical,
        dateDiff('month', F.first_month, toStartOfMonth(O.registered_date)) + 1 AS merchant_month,
        uniqExact(O.id) AS order_cnt
    FROM first_month AS F
    INNER JOIN fms_credit.tbl_order AS O
        ON toUInt64(O.venture_id) = F.venture_id
    WHERE O.status = 'SETTLE'
      AND O.payment_method_type != 'PAY_PRO'
    GROUP BY F.venture_id, F.vertical, merchant_month
),
six_months AS
(
    SELECT
        venture_id,
        vertical,
        maxIf(order_cnt, merchant_month = 1) AS m1_orders,
        maxIf(order_cnt, merchant_month = 2) AS m2_orders,
        maxIf(order_cnt, merchant_month = 3) AS m3_orders,
        maxIf(order_cnt, merchant_month = 4) AS m4_orders,
        maxIf(order_cnt, merchant_month = 5) AS m5_orders,
        maxIf(order_cnt, merchant_month = 6) AS m6_orders
    FROM monthly_orders
    WHERE merchant_month <= 6
    GROUP BY venture_id, vertical
),
recent_merchants AS
(
    SELECT DISTINCT toUInt64(venture_id) AS venture_id
    FROM fms_credit.tbl_order
    WHERE status = 'SETTLE'
      AND registered_date >= today() - INTERVAL 30 DAY
),
growth AS
(
    SELECT
        S.*,
        V.name AS merchant_name,
        round((S.m6_orders - S.m1_orders) / nullIf(S.m1_orders, 0) * 100, 2) AS growth_pct
    FROM six_months AS S
    INNER JOIN recent_merchants AS R ON R.venture_id = S.venture_id
    INNER JOIN fms_credit.tbl_venture AS V ON toUInt64(V.id) = S.venture_id
    WHERE S.m1_orders > 0
      AND S.m2_orders > S.m1_orders
      AND S.m3_orders > S.m2_orders
      AND S.m4_orders > S.m3_orders
      AND S.m5_orders > S.m4_orders
      AND S.m6_orders > S.m5_orders
      AND S.m6_orders >= 2 * S.m1_orders
),ranked AS
(
    SELECT
        *,
        row_number() OVER (PARTITION BY vertical ORDER BY growth_pct DESC) AS vertical_rank
    FROM growth
)
SELECT
    vertical_rank,
    vertical,
    merchant_name,
    m1_orders,
    m2_orders,
    m3_orders,
    m4_orders,
    m5_orders,
    m6_orders,
    growth_pct
FROM ranked
WHERE vertical_rank <= 5
ORDER BY vertical, vertical_rank;
```

---

## ۷. کوئری‌های آیتم و محصول

### بیست آیتم پرفروش هر مرچنت

```sql
WITH ranked_items AS
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
      AND O.registered_date >= toDate('{{start_date}}')
      AND O.registered_date < toDate('{{end_date}}')
      AND CI.count < 100
      AND V.name IN ({{merchant_names}})
    GROUP BY merchant_name, item_name, predicted_category, item_category
)
SELECT
    merchant_name,
    item_name,
    predicted_category,
    item_category,
    item_count,
    item_rank
FROM ranked_items
WHERE item_rank <= 20
ORDER BY merchant_name, item_rank;
```

---

## ۸. گزارش ثبت‌نام مرچنت

```sql
SELECT
    TR.created_date,
    toDate(TR.deleted_at) AS deleted_date,
    TR.ownership_type,
    TR.merchant_types_hash,
    TR.data_entry_stage,
    TR.id,
    TR.status,
    TR.online_home_page_url,
    TR.online_website_infrastructure,
    TR.owner_email,
    TR.owner_first_name,
    TR.owner_last_name,
    TR.owner_mobile,
    TR.product_category,
    TR.requester_mobile,
    TR.representative_mobile,
    TR.representative_name,
    TR.request_number,
    TR.store_name,
    TR.store_name_fa,
    TR.updated_at,
    TR.settlement_iban,
    TR.settlement_iban_owner_name,
    TR.settlement_bank,
    TR.owner_submitted_address,
    TR.owner_postal_code,
    TR.owner_national_code,
    P.online_commission,
    P.online_payment_term,
    P.online_category,
    P.instore_commission,
    P.instore_payment_term,
    P.instore_category
FROM fms_credit_warehoues.tbl_registration AS TR
LEFT JOIN
(
    SELECT
        TRSP.registration_id,
        anyIf(TSP.commission, TSP.merchant_type = 'ONLINE') AS online_commission,
        anyIf(TSP.payment_term, TSP.merchant_type = 'ONLINE') AS online_payment_term,
        anyIf(TSP.product_category, TSP.merchant_type = 'ONLINE') AS online_category,
        anyIf(TSP.commission, TSP.merchant_type = 'IN_STORE') AS instore_commission,
        anyIf(TSP.payment_term, TSP.merchant_type = 'IN_STORE') AS instore_payment_term,
        anyIf(TSP.product_category, TSP.merchant_type = 'IN_STORE') AS instore_category
    FROM fms_credit_warehoues.tbl_registration_settlement_policy AS TRSP
    LEFT JOIN fms_credit_warehoues.tbl_settlement_policy AS TSP
        ON TRSP.settlement_policy_id = TSP.id
    GROUP BY TRSP.registration_id
) AS P
    ON TR.id = P.registration_id;
```

---

## ۹. کوئری‌های لاگ اپلیکیشن

### تعداد رخدادها به تفکیک رویداد

```sql
SELECT
    event_name,
    count() AS event_count
FROM app_log.events
WHERE created_date >= toDate('{{start_date}}')
  AND app = '{{app_name}}'
GROUP BY event_name
ORDER BY event_count DESC;
```

### انتخاب محصول به تفکیک مرچنت

```sql
SELECT
    E.venture_name,
    CD.vertical,
    count() AS event_count
FROM app_log.events AS E
LEFT JOIN minio_db.commercial_data AS CD
    ON E.venture_name = CD.merchant_name
WHERE E.created_date >= toDate('{{start_date}}')
  AND E.created_date < toDate('{{end_date}}')
  AND E.app = 'py'
  AND E.event_name = 'Search Product Select'
  AND CD.vertical = '{{vertical}}'
GROUP BY E.venture_name, CD.vertical
ORDER BY event_count DESC;
```

### استخراج محصول انتخاب‌شده

```sql
SELECT
    JSONExtractString(toString(E.payload), 'Product_Name') AS product_name,
    E.venture_name,
    count() AS event_count
FROM app_log.events AS E
LEFT JOIN minio_db.commercial_data AS CD
    ON E.venture_name = CD.merchant_name
WHERE E.created_date >= toDate('{{start_date}}')
  AND E.created_date < toDate('{{end_date}}')
  AND E.app = 'py'
  AND E.event_name = 'Search Product Select'
  AND CD.vertical = '{{vertical}}'
GROUP BY product_name, E.venture_name
ORDER BY event_count DESC;
```

### تبدیل کلیک فروشگاه به سفارش در پنجرهٔ ۲۴ ساعته

```sql
WITH clicks AS
(
    SELECT
        wallet_id,
        created_at AS click_time
    FROM app_log.events
    WHERE created_at >= toDateTime('{{start_datetime}}')
      AND created_at < toDateTime('{{end_datetime}}')
      AND app = 'py'
      AND event_name = 'Click On Store'
      AND venture_id = {{venture_id}}
),
orders AS
(
    SELECT
        O.wallet_id,
        O.id AS order_id,
        O.created_at AS order_time,
        O.status
    FROM fms_credit.tbl_order AS O
    WHERE O.created_at >= toDateTime('{{start_datetime}}')
      AND O.created_at < toDateTime('{{order_end_datetime}}')
      AND O.venture_id = {{venture_id}}
      AND O.merchant_type = 'ONLINE'
      AND O.status IN ('SETTLE', 'CANCEL')
)
SELECT
    count() AS total_clicks,
    uniqExactIf(C.wallet_id, O.order_id IS NOT NULL) AS converted_users,
    uniqExactIf(O.order_id, O.status IN ('SETTLE', 'CANCEL')) AS orders_settle_cancel,
    uniqExactIf(O.order_id, O.status = 'SETTLE') AS orders_settle,
    round(orders_settle_cancel / nullIf(total_clicks, 0) * 100, 2) AS conversion_settle_cancel_pct,
    round(orders_settle / nullIf(total_clicks, 0) * 100, 2) AS conversion_settle_pct
FROM clicks AS C
LEFT JOIN orders AS O
    ON O.wallet_id = C.wallet_id
   AND O.order_time > C.click_time
   AND O.order_time <= C.click_time + INTERVAL 24 HOUR;
```

نکته: در این روش هر کلیک می‌تواند با چند سفارش join شود و `total_clicks` نیز تعداد ردیف‌های پس از join را تغییر دهد. برای نرخ تبدیل دقیق‌تر، ابتدا هر کلیک را به یک پرچم تبدیل‌شده تبدیل و سپس تجمیع کن.

---

## ۱۰. هم‌پوشانی کاربران دو مرچنت

```sql
WITH source_users AS
(
    SELECT DISTINCT O.wallet_id
    FROM fms_credit.tbl_order AS O
    WHERE O.created_date >= toDate('{{source_created_start}}')
      AND O.registered_date >= toDate('{{start_date}}')
      AND O.registered_date < toDate('{{end_date}}')
      AND O.payment_method_type = 'INSTALLMENT'
      AND O.merchant_type = 'ONLINE'
      AND O.venture_id = {{source_venture_id}}
),
total_source_users AS
(
    SELECT uniqExact(wallet_id) AS users_count
    FROM source_users
)
SELECT
    CD.merchant_name AS merchant,
    uniqExact(O.wallet_id) AS shared_users,
    T.users_count AS total_source_users,
    round(shared_users * 100.0 / nullIf(T.users_count, 0), 2) AS user_share_pct
FROM source_users AS S
INNER JOIN fms_credit.tbl_order AS O
    ON O.wallet_id = S.wallet_id
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
CROSS JOIN total_source_users AS T
WHERE O.registered_date >= toDate('{{start_date}}')
  AND O.registered_date < toDate('{{end_date}}')
  AND O.payment_method_type = 'INSTALLMENT'
  AND O.merchant_type = 'ONLINE'
  AND O.venture_id != {{source_venture_id}}
  AND CD.vertical != 'Snapp-Venture'
GROUP BY CD.merchant_name, T.users_count
ORDER BY shared_users DESC;
```

---

## ۱۱. تارگت و Run Rate

### اصول

- ماه هدف با `target_month` مشخص می‌شود.
- ماه هدف پارسال با `addMonths(target_month, -12)` ساخته می‌شود.
- هدف سفارش از سفارش ماه مشابه پارسال و میانگین چند نسبت رشد تاریخی ساخته می‌شود.
- خروجی مبلغ باید واحد خود را اعلام کند.

الگوی پایه:

```sql
WITH params AS
(
    SELECT
        toDate('{{target_month}}') AS target_month,
        toStartOfMonth(addMonths(target_month, -1)) AS last_month,
        toStartOfMonth(addMonths(target_month, -2)) AS two_months_ago,
        toStartOfMonth(addMonths(target_month, -12)) AS last_year_target,
        toStartOfMonth(addMonths(target_month, -13)) AS last_year_last_month,
        toStartOfMonth(addMonths(target_month, -14)) AS last_year_two_months_ago
),
monthly AS
(
    SELECT
        toStartOfMonth(O.registered_date) AS month,
        upper(CD.vertical) AS vertical,
        uniqExact(O.id) AS orders,
        sum(O.amount) / 10 AS gmv_toman
    FROM fms_credit.tbl_order AS O
    INNER JOIN minio_db.commercial_data AS CD
        ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
    WHERE O.status = 'SETTLE'
      AND O.merchant_type = 'ONLINE'
      AND O.payment_method_type = 'INSTALLMENT'
    GROUP BY month, vertical
)
SELECT
    M.vertical,
    sumIf(M.orders, M.month = P.last_month) AS orders_last_month,
    sumIf(M.orders, M.month = P.last_year_target) AS orders_last_year_target,
    round(
        sumIf(M.gmv_toman, M.month = P.last_month)
        / nullIf(sumIf(M.orders, M.month = P.last_month), 0), 0
    ) AS aov_last_month
FROM monthly AS M
CROSS JOIN params AS P
GROUP BY M.vertical
ORDER BY orders_last_month DESC;
```

برای Commercial Planning جدید، این الگو باید با تفکیک `payment_method_type`، وضعیت ووچر و کوهورت تکمیل شود و نباید بدون اعتبارسنجی به‌عنوان پیش‌بینی نهایی استفاده شود.

---

## ۱۲. گزارش‌های مورد انتظار از مستندات ورودی

| کاربرد | منبع | خروجی اصلی |
|---|---|---|
| Merchant Status | داکیومنت متنی | تعداد ونچر به تفکیک ورتیکال، وضعیت، مدیر و دسته |
| Churned Merchants | داکیومنت متنی | مرچنت‌های بدون سفارش بعدی در آستانه‌های ۱۴، ۳۰ و ۶۰ روز |
| Reactivated Merchants | داکیومنت متنی | مرچنت‌هایی که پس از وقفه سفارش داده‌اند |
| New Active Merchant | هر دو منبع | ونچرهای دارای اولین سفارش موفق |
| Item / Order | هر دو منبع | سفارش، آیتم، مقدار، NMV و میانگین آیتم در سفارش |
| Order / Sales | هر دو منبع | GMV، تخفیف، ووچر، روش پرداخت و وضعیت سفارش |
| New Users | هر دو منبع | کاربران دارای اولین سفارش موفق |
| Active Users | هر دو منبع | کاربران فعال ماهانه |
| Reactivated Users | داکیومنت متنی | کاربر فعال فعلی با سابقه و بدون سفارش ماه قبل |
| Organic / Non-organic Users | داکیومنت متنی | وضعیت اولین سفارش کاربر از نظر ووچر |
| Order Interval | هر دو منبع | فاصلهٔ متوسط بین سفارش‌ها |
| Churn Gap | داکیومنت متنی | وقفه‌های بیشتر از آستانهٔ مشخص |
| Customer Overlap | اکسل | هم‌پوشانی کاربران مرچنت مبدأ و سایر مرچنت‌ها |
| Registration Dashboard | اکسل | مشخصات ثبت‌نام و سیاست تسویه |
| App Log | اکسل | رخدادها، انتخاب محصول، کلیک فروشگاه و تبدیل |
| Target / Run Rate | اکسل | تارگت سفارش و GMV و run rate |
| Top Items | اکسل | بیست آیتم برتر هر مرچنت |

---

## ۱۳. ایرادها و ریسک‌های مهم در کوئری‌های اولیه

### ۱۳.۱ استفاده از `toMonth` بدون سال

اگر خروجی بیش از یک سال را پوشش دهد، `toMonth(date)` ماه‌های سال‌های مختلف را روی هم می‌اندازد. برای گزارش‌های تاریخی همیشه از یکی از این‌ها استفاده کن:

```sql
toStartOfMonth(date) AS month
```

یا:

```sql
toYear(date) AS year,
toMonth(date) AS month
```

### ۱۳.۲ پنجرهٔ `leadInFrame` محدود به بازهٔ گزارش

برای تشخیص churn، اگر سفارش‌های بعدی خارج از بازهٔ استخراج حذف شوند، آخرین سفارش‌های بازه به‌اشتباه churn تلقی می‌شوند. برای محاسبهٔ churn باید دادهٔ سفارش را تا حداقل آستانهٔ churn بعد از پایان بازه نیز بخوانی.

### ۱۳.۳ پارتیشن‌بندی کوهورت

برای تعریف کوهورت کاربر، پارتیشن باید بر اساس `wallet_id` باشد؛ اگر هدف کوهورت مرچنت است، `wallet_id, vertical` یا `wallet_id, payment_method_type` را آگاهانه انتخاب کن. این انتخاب نباید ضمنی باشد.

### ۱۳.۴ تفکیک کاربر و سفارش

این دو مفهوم مستقل هستند:

- سفارش ارگانیک: همان سفارش ووچر ندارد.
- کاربر ارگانیک: اولین سفارش موفق کاربر ووچر نداشته است.

یک کاربر ارگانیک می‌تواند بعداً سفارش ووچردار ثبت کند؛ بنابراین نباید همهٔ سفارش‌های او را ارگانیک حساب کرد.

### ۱۳.۵ احتمال چندبرابر شدن با `commercial_data`

قبل از هر جمع‌زدن، این کنترل را اجرا کن:

```sql
SELECT
    toUInt64(venture_id) AS venture_id,
    count() AS rows_per_venture
FROM minio_db.commercial_data
GROUP BY venture_id
HAVING rows_per_venture > 1
ORDER BY rows_per_venture DESC;
```

اگر نتیجه دارد، ابتدا یک نسخهٔ یکتا از دیکشنری با قاعدهٔ انتخاب مشخص بساز.

### ۱۳.۶ شمارش سفارش در join آیتم

در join سفارش و آیتم، `count()` تعداد ردیف آیتم را می‌دهد، نه تعداد سفارش. برای سفارش از `uniqExact(O.id)` استفاده کن.

### ۱۳.۷ `BETWEEN` برای تاریخ و زمان

برای جلوگیری از دوباره‌شماری بین بازه‌ها از بازهٔ نیمه‌باز استفاده کن و به جای:

```sql
registered_date BETWEEN '2026-06-22' AND '2026-07-22'
```

از این استفاده کن:

```sql
registered_date >= toDateTime('2026-06-22 00:00:00')
AND registered_date < toDateTime('2026-07-23 00:00:00')
```

### ۱۳.۸ تبدیل مبلغ

وجود `/ 10` در بعضی کوئری‌ها قرارداد تومان/ریال را نشان می‌دهد، اما برای همهٔ جدول‌ها قطعی نیست. قبل از گزارش مالی، یک نمونه از مبلغ خام و مبلغ قابل انتظار کسب‌وکار را تطبیق بده.

### ۱۳.۹ پنجرهٔ تبدیل کلیک به سفارش

برای محاسبهٔ نرخ تبدیل، join مستقیم کلیک به سفارش می‌تواند یک کلیک را چند بار بشمارد. شاخص‌های `total_clicks`، `converted_users` و `orders` باید در سطح مناسب و با تعریف روشن گزارش شوند.

### ۱۳.۱۰ نام‌گذاری مقادیر Payment Method

در اسناد، مقادیر مشابهی با حروف متفاوت وجود دارد: `INSTALLMENT`، `POSTPAID`، `PAY_NOW`، `FINANCING`، `WALLET` و `PAY_PRO`. قبل از ساخت mapping نهایی، مقادیر واقعی را با این کوئری استخراج کن:

```sql
SELECT
    payment_method_type,
    count() AS rows_count,
    uniqExact(venture_id) AS ventures
FROM fms_credit.tbl_order
GROUP BY payment_method_type
ORDER BY rows_count DESC;
```

---

## ۱۴. کنترل‌های کیفیت داده

قبل از هر گزارش یا مدل، این کنترل‌ها را اجرا کن:

```sql
-- وضعیت سفارش
SELECT status, count() FROM fms_credit.tbl_order GROUP BY status ORDER BY count() DESC;

-- نوع مرچنت
SELECT merchant_type, count() FROM fms_credit.tbl_order GROUP BY merchant_type ORDER BY count() DESC;

-- روش پرداخت
SELECT payment_method_type, count() FROM fms_credit.tbl_order GROUP BY payment_method_type ORDER BY count() DESC;

-- مقدارهای خالی پایه
SELECT
    countIf(isNull(wallet_id)) AS null_wallet_id,
    countIf(isNull(venture_id)) AS null_venture_id,
    countIf(isNull(amount)) AS null_amount,
    countIf(amount = 0) AS zero_amount
FROM fms_credit.tbl_order
WHERE registered_date >= toDate('{{start_date}}')
  AND registered_date < toDate('{{end_date}}');

-- کنترل تخفیف ووچر نسبت به مبلغ سفارش
SELECT count() AS invalid_rows
FROM fms_credit.tbl_order
WHERE voucher_discount_amount > amount
  AND registered_date >= toDate('{{start_date}}')
  AND registered_date < toDate('{{end_date}}');
```

کنترل یکتایی دیکشنری:

```sql
SELECT
    toUInt64(venture_id) AS venture_id,
    count() AS dictionary_rows
FROM minio_db.commercial_data
GROUP BY venture_id
HAVING dictionary_rows > 1;
```

کنترل ترتیب کوهورت:

```sql
SELECT count() AS invalid_cohort_rows
FROM cohort_source
WHERE activity_month < cohort_month;
```

---

## ۱۵. روش ساخت کوئری توسط دستیار هوش مصنوعی

دستیار باید قبل از تولید کوئری این مراحل را انجام دهد:

1. هدف گزارش را مشخص کند: فروش، کاربر، مرچنت، آیتم، لاگ یا تارگت.
2. سطح خروجی را مشخص کند: سفارش، کاربر، ونچر، ماه، ورتیکال، دسته یا روش پرداخت.
3. واحد مبلغ را تعیین کند؛ در این پروژه واحد خروجی تومان است.
4. بازهٔ تاریخ را به شکل نیمه‌باز بسازد.
5. مشخص کند گزارش فقط `SETTLE` است یا همهٔ وضعیت‌ها را می‌خواهد.
6. مشخص کند `ONLINE` است یا همهٔ `merchant_type`ها.
7. joinهای لازم را اضافه کند و احتمال چندبرابرشدن را بررسی کند.
8. برای سفارش از `uniqExact(order_id)` و برای کاربر از `uniqExact(wallet_id)` استفاده کند.
9. اگر تفکیک ووچر لازم است، از `coalesce(voucher_discount_amount, 0) > 0` استفاده کند.
10. اگر کاربر ارگانیک/غیرارگانیک لازم است، وضعیت اولین سفارش را جدا بسازد.
11. اگر گزارش چندساله است، سال را کنار ماه نگه دارد.
12. خروجی را با نام ستون‌های روشن، واحد مبلغ و فرضیات ارائه کند.
13. در صورت نامشخص بودن واحد خام مبلغ، مقدار را حدس نزند و آن را به‌عنوان ابهام اعلام کند.

### قالب پاسخ پیشنهادی دستیار

```text
هدف گزارش:
سطح خروجی:
بازه:
فیلتر وضعیت:
فیلتر merchant_type:
واحد مبلغ:
تعریف کاربر:
تعریف سفارش:
فرض‌های استفاده‌شده:

SQL:

کنترل‌های پیشنهادی:
```

---

## ۱۶. نگاشت نیاز مدل BNPL به دیتابیس

| نیاز مدل | منبع قابل استفاده |
|---|---|
| Orders | `tbl_order.id` با `uniqExact` |
| Users | `tbl_order.wallet_id` با `uniqExact` |
| Gross GMV | `tbl_order.amount / 10` با خروجی تومان |
| AOV | `Gross GMV / Orders` |
| Voucher orders | `voucher_discount_amount > 0` |
| Organic orders | `voucher_discount_amount` صفر یا خالی؛ حتی با وجود `discount_amount` مثبت |
| Voucher cost | `voucher_discount_amount / 10` با خروجی تومان |
| Payment Method | `payment_method_type` با نگاشت تجاری مستقل برای هر مقدار؛ `WALLET` و `PAY_PRO` مستقل |
| Unknown Payment Method | نگه‌داری در گزارش کنترل کیفیت |
| Vertical | `commercial_data.vertical`؛ فهرست نهایی هفت Vertical اعلام‌شده |
| Category | `commercial_data.category`؛ حذف یا نگه‌داری بر اساس درخواست گزارش |
| User cohort | اولین سفارش موفق در دامنهٔ Commercial، با `wallet_id` |
| User organic status | ووچر در اولین سفارش موفق؛ ویژگی ثابت کاربر |
| Monthly activity | ماه بر اساس فیلد تاریخ انتخاب‌شده در هر کوئری |
| Merchant cohort | اولین سفارش موفق برای `venture_id` |

### محدودیت مهم

فایل‌های موجود کوئری‌های زیادی در سطح روزانه و رکورد خام دارند، اما برای مدل نهایی باید یک جدول تجمیعی ماهانه با دیکشنری مشخص تولید شود. تا زمانی که Gross GMV، تاریخ معتبر، mapping نهایی Payment Method و یکتایی `commercial_data` تأیید نشود، عدد پیش‌بینی نباید قطعی تلقی شود.

---

## ۱۷. نسخه و وضعیت سند

- وضعیت: نسخهٔ بازبینی‌شدهٔ راهنمای دیتابیس و کوئری‌های Commercial
- تاریخ تهیه: ۱۲ آبان ۱۴۰۵
- واحد خام مبالغ: ریال
- واحد خروجی مالی: تومان
- Gross GMV: `fms_credit.tbl_order.amount / 10`
- موتور مورد انتظار: ClickHouse
- دامنه: Commercial، فروش، کاربران، مرچنت، آیتم، لاگ و تارگت
- موارد بازمانده برای تصمیم یا اعتبارسنجی فنی: فیلد تاریخ مبنای سفارش، سیاست `deleted_at`، سطح تقویم کمپین، و نوع/زمان ستون انتخاب ردیف جدید در `commercial_data`
