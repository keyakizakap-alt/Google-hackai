"""IP単位の簡易レート制限。

インスタンスごとのメモリ上のカウンタなので、Cloud Run が複数インスタンスに
スケールすると上限はインスタンス数倍になる。厳密な制限が要る場合は
Cloud Armor や Memorystore に寄せる前提で、ここでは
--max-instances と併用して費用の上限を抑えることを目的にしている。
"""

import os
import time
from collections import defaultdict, deque

WINDOW_SEC = int(os.environ.get("RATE_WINDOW_SEC", "60"))
MAX_CALLS = int(os.environ.get("RATE_MAX_CALLS", "10"))

_hits: dict[str, deque[float]] = defaultdict(deque)


def check(key: str) -> bool:
    """許可なら True。上限超過なら False。"""
    now = time.monotonic()
    q = _hits[key]

    while q and now - q[0] > WINDOW_SEC:
        q.popleft()

    if len(q) >= MAX_CALLS:
        return False

    q.append(now)

    # 使われなくなったキーが溜まり続けないよう、たまに掃除する
    if len(_hits) > 1024:
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > WINDOW_SEC]:
            del _hits[k]

    return True
