"""Google Places API (New) アダプタ。

Places API のレスポンスを、このアプリの Spot モデルへ変換する層。

Places API だけでは Spot を埋めきれない項目が3つあり、ここで補っている:

  indoor        Places に屋内/屋外のフィールドが存在しないため types から推定する。
                「屋内と判定を誤る」と雨天時に濡れる場所へ誘導してしまうので、
                判断できない type は屋外扱いにする（安全側に倒す）。
  travel_minutes  Places は座標しか返さないため、エリア中心からの直線距離を
                徒歩分に換算している。実経路ではないので、正確な値が要る場合は
                Routes API に差し替える。
  price_yen     Places の priceLevel は5段階の列挙型で金額ではない。
                代表額にマッピングしている。飲食以外では未設定のことが多い。

課金上の注意: regularOpeningHours と priceLevel は Enterprise SKU、
editorialSummary は Atmosphere SKU を発生させる。editorialSummary は
PLACES_USE_SUMMARY=0 で切ると1段安い SKU に落とせる。
"""

import math
import os
import time
from datetime import datetime, timedelta, timezone

import httpx

import obs
import spots_data
from catalog import Spot

ENDPOINT = "https://places.googleapis.com/v1/places:searchNearby"
JST = timezone(timedelta(hours=9))

API_KEY = os.environ.get("PLACES_API_KEY", "")
USE_SUMMARY = os.environ.get("PLACES_USE_SUMMARY", "1") != "0"
CACHE_TTL_SEC = int(os.environ.get("PLACES_CACHE_TTL_SEC", "3600"))
RADIUS_M = float(os.environ.get("PLACES_RADIUS_M", "1500"))
TIMEOUT_SEC = float(os.environ.get("PLACES_TIMEOUT_SEC", "6"))

# エリア中心。travel_minutes の起点にもなる。都道府県の拠点駅を使う
AREAS: dict[str, tuple[float, float]] = {
    code: (lat, lng) for code, (_, _, lat, lng) in spots_data.AREAS.items()
}

# 取得対象。屋内で時間を潰せる業種を優先している
INCLUDED_TYPES = [
    "museum",
    "art_gallery",
    "aquarium",
    "cafe",
    "restaurant",
    "book_store",
    "shopping_mall",
    "spa",
    "tourist_attraction",
]

INDOOR_TYPES = {
    "museum", "art_gallery", "aquarium", "cafe", "restaurant", "bakery",
    "book_store", "shopping_mall", "spa", "movie_theater", "library",
    "department_store", "bar", "onsen",
}

OUTDOOR_TYPES = {
    "park", "hiking_area", "campground", "beach", "garden", "zoo",
}

CATEGORY_BY_TYPE = {
    "museum": "museum", "art_gallery": "museum", "aquarium": "museum",
    "cafe": "cafe", "bakery": "cafe",
    "restaurant": "food", "bar": "food",
    "spa": "onsen", "onsen": "onsen",
    "book_store": "rest", "library": "rest",
    "shopping_mall": "food", "department_store": "food",
    "park": "walk", "garden": "walk",
    "buddhist_temple": "temple", "shinto_shrine": "temple",
    "tourist_attraction": "experience",
}

# priceLevel は金額ではなく5段階の列挙。代表額に寄せる
PRICE_BY_LEVEL = {
    "PRICE_LEVEL_FREE": 0,
    "PRICE_LEVEL_INEXPENSIVE": 1000,
    "PRICE_LEVEL_MODERATE": 3000,
    "PRICE_LEVEL_EXPENSIVE": 8000,
    "PRICE_LEVEL_VERY_EXPENSIVE": 15000,
}
PRICE_UNKNOWN = 1000

TAG_BY_TYPE = {
    "museum": ("文化",), "art_gallery": ("文化", "静か"),
    "aquarium": ("ファミリー", "写真映え"),
    "cafe": ("休憩", "ゆったり"), "bakery": ("休憩",),
    "restaurant": ("食事",), "bar": ("食事", "夜"),
    "spa": ("体を温める", "体調回復"), "onsen": ("体を温める", "体調回復"),
    "book_store": ("静か", "休憩"), "library": ("静か", "休憩"),
    "shopping_mall": ("食べ歩き", "賑やか"),
    "buddhist_temple": ("文化", "定番"), "shinto_shrine": ("文化", "定番"),
    "tourist_attraction": ("定番",),
    "park": ("散策",), "garden": ("散策", "静か"),
}

_cache: dict[str, tuple[float, list[Spot]]] = {}


def _travel_minutes(origin: tuple[float, float], lat: float, lng: float) -> int:
    """直線距離を徒歩分に換算する。実経路ではないので迂回係数を掛ける。"""
    r = 6371000.0
    p1, p2 = math.radians(origin[0]), math.radians(lat)
    dp = math.radians(lat - origin[0])
    dl = math.radians(lng - origin[1])
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    meters = 2 * r * math.asin(math.sqrt(a))
    return max(1, round(meters * 1.3 / 80))  # 迂回1.3倍 / 徒歩80m/分


def _hours(place: dict) -> tuple[int, int, bool]:
    """今日の営業時間を (開始時, 終了時, 判明したか) で返す。"""
    periods = (place.get("regularOpeningHours") or {}).get("periods") or []
    if not periods:
        return 0, 24, False

    # Places の day は 0=日曜。Python の weekday() は 0=月曜
    today = (datetime.now(JST).weekday() + 1) % 7

    for p in periods:
        o = p.get("open") or {}
        if o.get("day") != today:
            continue
        c = p.get("close")
        if not c:  # close が無い = 24時間営業
            return 0, 24, True
        open_h = int(o.get("hour", 0))
        close_h = int(c.get("hour", 0))
        if c.get("day") != o.get("day") or close_h <= open_h:
            close_h = 24  # 日をまたぐ営業
        return open_h, close_h, True

    return 0, 0, True  # 今日は定休日


def _to_spot(place: dict, origin: tuple[float, float]) -> Spot | None:
    pid = place.get("id")
    name = (place.get("displayName") or {}).get("text")
    loc = place.get("location") or {}
    if not pid or not name or "latitude" not in loc:
        return None

    types = place.get("types") or []
    indoor = any(t in INDOOR_TYPES for t in types) and not any(
        t in OUTDOOR_TYPES for t in types
    )

    open_h, close_h, hours_known = _hours(place)
    if open_h >= close_h:
        return None  # 今日は開いていない

    tags: list[str] = ["屋内" if indoor else "屋外"]
    if indoor:
        tags.append("雨でも快適")
    for t in types:
        tags.extend(TAG_BY_TYPE.get(t, ()))
    if not hours_known:
        # 営業時間が取れなかったことを提案側から見えるようにしておく
        tags.append("営業時間未確認")

    price = PRICE_BY_LEVEL.get(place.get("priceLevel"), PRICE_UNKNOWN)
    if price == 0:
        tags.append("無料")

    category = next((CATEGORY_BY_TYPE[t] for t in types if t in CATEGORY_BY_TYPE), "experience")
    blurb = (place.get("editorialSummary") or {}).get("text") or f"{name}（{category}）"

    return Spot(
        id=pid,
        name=name,
        category=category,
        indoor=indoor,
        travel_minutes=_travel_minutes(origin, loc["latitude"], loc["longitude"]),
        open_hour=open_h,
        close_hour=close_h,
        price_yen=price,
        tags=tuple(dict.fromkeys(tags)),
        blurb=blurb,
    )


def parse(payload: dict, origin: tuple[float, float]) -> list[Spot]:
    """API レスポンスを Spot のリストへ変換する（テストから直接呼べるよう分離）。"""
    spots = []
    for place in payload.get("places") or []:
        spot = _to_spot(place, origin)
        if spot:
            spots.append(spot)
    return spots


def _field_mask() -> str:
    fields = [
        "places.id",
        "places.displayName",
        "places.types",
        "places.location",
        "places.regularOpeningHours",  # Enterprise SKU
        "places.priceLevel",  # Enterprise SKU
    ]
    if USE_SUMMARY:
        fields.append("places.editorialSummary")  # Atmosphere SKU
    return ",".join(fields)


async def fetch(area: str, request_id: str = "") -> list[Spot]:
    """Places API からスポットを取得する。結果は TTL 付きでキャッシュする。"""
    if not API_KEY:
        raise RuntimeError("PLACES_API_KEY が未設定です")

    origin = AREAS.get(area)
    if origin is None:
        raise ValueError(f"未登録のエリアです: {area}")

    hit = _cache.get(area)
    if hit and time.monotonic() - hit[0] < CACHE_TTL_SEC:
        obs.info("places.cache_hit", request_id=request_id, area=area, spots=len(hit[1]))
        return hit[1]

    body = {
        "includedTypes": INCLUDED_TYPES,
        "maxResultCount": 20,
        "languageCode": "ja",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": origin[0], "longitude": origin[1]},
                "radius": RADIUS_M,
            }
        },
    }

    async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
        res = await client.post(
            ENDPOINT,
            json=body,
            headers={
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": _field_mask(),
                "Content-Type": "application/json",
            },
        )
    res.raise_for_status()

    spots = parse(res.json(), origin)
    _cache[area] = (time.monotonic(), spots)
    obs.info("places.fetched", request_id=request_id, area=area, spots=len(spots))
    return spots
