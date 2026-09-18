"""スポットの供給層。

LLM はここが返したスポットしか提案できない（ハルシネーション防止の要）。

供給元は環境変数 SPOT_SOURCE で切り替える:
  static (既定) … spots_data.py の全国カタログを使う
  places        … Google Places API から取得し、失敗時は static に退避

エージェント側は load() が返す SpotSet だけを見るので、
供給元が変わっても検索・検算のロジックはそのまま使える。
"""

import os
from dataclasses import asdict, dataclass

import obs
from schemas import Constraints

SPOT_SOURCE = os.environ.get("SPOT_SOURCE", "static")


@dataclass(frozen=True)
class Spot:
    id: str
    name: str
    category: str
    indoor: bool
    # エリアの拠点駅からの移動分数。徒歩前提ではないので、
    # 都道府県スケールでは公共交通での所要も含む
    travel_minutes: int
    open_hour: int
    close_hour: int
    price_yen: int
    tags: tuple[str, ...]
    blurb: str
    area: str = ""


def _static_for(area: str) -> list[Spot]:
    """指定エリアの静的スポット。未知のエリアなら京都にフォールバックする。"""
    import spots_data

    hits = [s for s in spots_data.SPOTS if s.area == area]
    return hits or [s for s in spots_data.SPOTS if s.area == "kyoto"]


class SpotSet:
    """1リクエスト分のスポット集合。

    Places API を使う場合、対象スポットはリクエストごとに変わるため、
    検索対象と検算時のID照合は必ず同じこの集合を見る必要がある。
    """

    def __init__(self, spots: list[Spot], source: str):
        self.spots = spots
        self.source = source
        self.by_id = {s.id: s for s in spots}

    def search(self, c: Constraints, mobility: str, now_hour: int) -> list[Spot]:
        """制約に合うスポットだけを決定的に絞り込む（LLM を通さない）。"""
        # 移動手段で到達できる範囲が変わる。徒歩のみだと県内の大半が圏外になる
        reach = c.max_travel_minutes * {"walk": 1, "transit": 2, "taxi": 3, "car": 3}.get(mobility, 1)

        hits = []
        for s in self.spots:
            if c.indoor_required and not s.indoor:
                continue
            if s.travel_minutes > reach:
                continue
            if s.price_yen > c.max_spend_yen:
                continue
            if not (s.open_hour <= now_hour < s.close_hour):
                continue
            if any(t in s.tags for t in c.avoid_tags):
                continue
            hits.append(s)

        def score(s: Spot) -> tuple[int, int]:
            pref = sum(1 for t in c.prefer_tags if t in s.tags)
            return (-pref, s.travel_minutes)

        return sorted(hits, key=score)


async def load(area: str, request_id: str = "") -> SpotSet:
    """供給元からスポットを取得する。Places が使えなければ static に退避する。"""
    if SPOT_SOURCE != "places":
        return SpotSet(_static_for(area), "static")

    import places  # Places を使うときだけ読み込む

    try:
        spots = await places.fetch(area, request_id)
    except Exception as e:
        obs.warn(
            "spots.places_failed",
            request_id=request_id,
            error=type(e).__name__,
            detail=str(e)[:300],
        )
        spots = []

    if not spots:
        # 実データが取れなければ提案自体が止まるので、静的カタログで継続する
        obs.warn("spots.fallback_to_static", request_id=request_id, area=area)
        return SpotSet(_static_for(area), "static-fallback")

    return SpotSet(spots, "places")


def as_dict(s: Spot) -> dict:
    d = asdict(s)
    d["tags"] = list(s.tags)
    return d
