from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_reports_knowledge():
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_sales_query_is_read_only_and_uses_half_open_dates():
    response = client.post('/api/chat', json={'message': 'فروش از 2026-01-01 تا 2026-02-01'})
    body = response.json()
    assert response.status_code == 200
    assert "O.status = 'SETTLE'" in body['sql']
    assert "toDate('2026-01-01')" in body['sql']
    assert "toDate('2026-02-01')" in body['sql']
    assert 'DELETE' not in body['sql']
    assert body['execution']['enabled'] is False


def test_unknown_request_asks_for_clarification():
    body = client.post('/api/chat', json={'message': 'یک گزارش خاص می‌خواهم'}).json()
    assert body['sql'] == ''
    assert body['title'] == 'نیاز به شفاف‌سازی'
