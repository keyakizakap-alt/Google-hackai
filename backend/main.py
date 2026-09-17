import os
import uuid
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import agent
import obs
import ratelimit
from schemas import AdoptRequest, RecoveryRequest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="逆転コンシェルジュ", version="0.2.0")


def _client_ip(request: Request) -> str:
    # Cloud Run は X-Forwarded-For の先頭に実クライアントIPを入れる
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


@app.get("/healthz")
def healthz() -> dict:
    return {"status": "ok", "mode": "gemini" if os.environ.get("GEMINI_API_KEY") else "demo"}


@app.post("/api/recover")
async def recover(req: RecoveryRequest, request: Request):
    """エージェントの各段を Server-Sent Events で流す。"""
    ip = _client_ip(request)
    if not ratelimit.check(ip):
        obs.warn("ratelimit.blocked", client_ip=ip)
        return JSONResponse(
            {"detail": "リクエストが多すぎます。しばらく待ってから再度お試しください。"},
            status_code=429,
        )

    return StreamingResponse(
        agent.run(req, request_id=uuid.uuid4().hex[:16]),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/adopt")
def adopt(body: AdoptRequest) -> dict:
    """採用されたプランを記録する。

    要件定義書のKPI（トラブル解決率・Time to Recovery）を算出するための唯一の入力。
    プロトタイプでは構造化ログに出すだけで、BigQuery 等への蓄積は行っていない。
    """
    obs.info(
        "plan.adopted",
        request_id=body.request_id,
        plan_index=body.plan_index,
        plan_title=body.plan_title,
        trouble=body.trouble.value,
        time_to_recovery_ms=body.time_to_recovery_ms,
    )
    return {"recorded": True}


app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")
