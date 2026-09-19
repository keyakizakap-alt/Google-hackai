"""可観測性。

Cloud Logging は stdout に出力された JSON をそのまま構造化ログとして取り込むため、
専用ライブラリを使わずに jsonPayload を組み立てる。
"""

import json
import sys
import time
from contextlib import contextmanager


def log(severity: str, message: str, **fields) -> None:
    payload = {"severity": severity, "message": message, **fields}
    print(json.dumps(payload, ensure_ascii=False), file=sys.stdout, flush=True)


def info(message: str, **fields) -> None:
    log("INFO", message, **fields)


def warn(message: str, **fields) -> None:
    log("WARNING", message, **fields)


@contextmanager
def stage(name: str, request_id: str, **fields):
    """各段の所要時間を計測して構造化ログに残す。"""
    started = time.perf_counter()
    result: dict = {}
    try:
        yield result
    finally:
        info(
            f"stage.{name}",
            request_id=request_id,
            stage=name,
            duration_ms=round((time.perf_counter() - started) * 1000, 1),
            **fields,
            **result,
        )
