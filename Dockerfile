FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PORT=8080

# 審査時に何時にアクセスされても営業時間フィルタで全滅しないよう、デモ用に時刻を固定する。
# 実時刻で動かす場合は空文字を渡す: gcloud run deploy --set-env-vars DEMO_HOUR=
ENV DEMO_HOUR=14

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY frontend/ ./frontend/

EXPOSE 8080

# Cloud Run は $PORT を注入する
CMD exec uvicorn main:app --app-dir backend --host 0.0.0.0 --port ${PORT}
