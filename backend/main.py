import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import agent
from schemas import RecoveryRequest

FRONTEND = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="逆転コンシェルジュ", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict:
    return {
        "status": "ok",
        "mode": "gemini" if os.environ.get("GEMINI_API_KEY") else "demo",
        "model": agent.MODEL,
    }


@app.post("/api/recover")
async def recover(req: RecoveryRequest) -> StreamingResponse:
    """エージェントの各段を Server-Sent Events で流す。"""
    return StreamingResponse(
        agent.run(req),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


app.mount("/static", StaticFiles(directory=FRONTEND), name="static")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")
