from pathlib import Path
import re
from typing import Any

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
GUIDE_PATH = ROOT / "uploads" / "commercial_database_query_guide.md"

app = FastAPI(title="Text2SQL Assistant", version="0.1.0")


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


def guide_text() -> str:
    if GUIDE_PATH.exists():
        return GUIDE_PATH.read_text(encoding="utf-8")
    return "راهنمای سازمانی هنوز در محیط اجرا نصب نشده است."


def date_range(message: str) -> tuple[str, str]:
    dates = re.findall(r"\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b", message)
    if len(dates) >= 2:
        return dates[0].replace("/", "-"), dates[1].replace("/", "-")
    return "YYYY-MM-DD", "YYYY-MM-DD"


def template_for(message: str) -> tuple[str, str, list[str]]:
    text = message.lower()
    start, end = date_range(message)
    assumptions = [
        "موتور هدف ClickHouse است.",
        "بازهٔ زمانی نیمه‌باز است و پایان بازه شامل نمی‌شود.",
        "مبلغ خروجی به تومان تبدیل می‌شود.",
    ]
    if any(word in text for word in ("مرچنت", "merchant", "ونچر", "venture")) and any(
        word in text for word in ("وضعیت", "status")
    ):
        sql = """SELECT
    CD.vertical,
    V.status,
    CD.account_manager,
    CD.category,
    uniqExact(V.id) AS ventures
FROM fms_credit.tbl_venture AS V
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(V.id)
GROUP BY CD.vertical, V.status, CD.account_manager, CD.category
ORDER BY CD.vertical, V.status, CD.category;"""
        return "وضعیت مرچنت‌ها به تفکیک ورتیکال و دسته", sql, assumptions

    if any(word in text for word in ("کاربر فعال", "active user", "فعال ماهانه")):
        sql = f"""SELECT
    toStartOfMonth(O.registered_date) AS month,
    CD.vertical,
    uniqExact(O.wallet_id) AS active_users
FROM fms_credit.tbl_order AS O
INNER JOIN minio_db.commercial_data AS CD
    ON toUInt64(CD.venture_id) = toUInt64(O.venture_id)
WHERE O.status = 'SETTLE'
  AND O.merchant_type = 'ONLINE'
  AND O.registered_date >= toDate('{start}')
  AND O.registered_date < toDate('{end}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY month, CD.vertical
ORDER BY month, CD.vertical;"""
        return "کاربران فعال ماهانه", sql, assumptions

    if any(word in text for word in ("فروش", "gmv", "فروش ناخالص", "sales")):
        assumptions.append("فقط سفارش‌های موفق ONLINE در Commercial اصلی گزارش می‌شوند.")
        sql = f"""SELECT
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
  AND O.registered_date >= toDate('{start}')
  AND O.registered_date < toDate('{end}')
  AND CD.vertical != 'Snapp-Venture'
  AND CD.category NOT IN ('in_store', 'social', 'ventures')
GROUP BY month, CD.vertical, O.payment_method_type
ORDER BY month, CD.vertical, O.payment_method_type;"""
        return "فروش ناخالص، سفارش و هزینهٔ ووچر", sql, assumptions

    if any(word in text for word in ("کاربر جدید", "new user", "ثبت‌نام کاربر")):
        sql = f"""WITH first_user_order AS
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
WHERE first_order_date >= toDate('{start}')
  AND first_order_date < toDate('{end}')
GROUP BY month
ORDER BY month;"""
        return "کاربران جدید بر اساس اولین سفارش موفق", sql, assumptions

    return "نیاز به شفاف‌سازی", "", [
        "هدف گزارش را مشخص کنید: فروش، کاربران فعال، کاربران جدید یا وضعیت مرچنت‌ها.",
        "بازهٔ زمانی را با دو تاریخ مثل 2026-01-01 تا 2026-02-01 اعلام کنید.",
        "در نسخهٔ بعدی بازیابی معنایی از راهنمای سازمانی و پرسش‌های تکمیلی اضافه می‌شود.",
    ]


def retrieve_context(message: str) -> list[str]:
    terms = {term for term in re.findall(r"[\wآ-ی]{3,}", message.lower())}
    matches = []
    for block in guide_text().split("\n\n"):
        score = sum(term in block.lower() for term in terms)
        if score:
            matches.append((score, block.strip().replace("\n", " ")[:240]))
    return [item[1] for item in sorted(matches, reverse=True)[:3]]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "knowledge": "loaded" if GUIDE_PATH.exists() else "missing"}


@app.post("/api/chat")
def chat(request: ChatRequest) -> dict[str, Any]:
    title, sql, assumptions = template_for(request.message)
    return {
        "title": title,
        "sql": sql,
        "assumptions": assumptions,
        "context": retrieve_context(request.message),
        "execution": {"enabled": False, "reason": "نسخهٔ MVP فقط SQL را تولید می‌کند."},
    }


app.mount("/", StaticFiles(directory=ROOT / "static", html=True), name="static")
