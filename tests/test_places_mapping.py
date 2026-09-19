"""Places API レスポンスの変換層を、実APIを叩かずに検証する。"""

import pathlib
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import places  # noqa: E402

JST = timezone(timedelta(hours=9))
TODAY = (datetime.now(JST).weekday() + 1) % 7  # Places の day は 0=日曜
ORIGIN = places.AREAS["kyoto"]

PAYLOAD = {
    "places": [
        {   # 屋内・営業中・価格あり・説明あり
            "id": "ChIJ_museum",
            "displayName": {"text": "京都市美術館"},
            "types": ["art_gallery", "museum"],
            "location": {"latitude": 35.0100, "longitude": 135.7830},
            "regularOpeningHours": {
                "periods": [{"open": {"day": TODAY, "hour": 10}, "close": {"day": TODAY, "hour": 18}}]
            },
            "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
            "editorialSummary": {"text": "近代美術を集めた市立美術館。"},
        },
        {   # 屋外（公園）→ indoor=False になるべき
            "id": "ChIJ_park",
            "displayName": {"text": "円山公園"},
            "types": ["park", "tourist_attraction"],
            "location": {"latitude": 35.0040, "longitude": 135.7820},
            "regularOpeningHours": {
                "periods": [{"open": {"day": TODAY, "hour": 0}}]  # close なし = 24時間
            },
        },
        {   # 今日が定休日 → 除外されるべき
            "id": "ChIJ_closed_today",
            "displayName": {"text": "定休日の店"},
            "types": ["cafe"],
            "location": {"latitude": 35.0050, "longitude": 135.7800},
            "regularOpeningHours": {
                "periods": [{"open": {"day": (TODAY + 1) % 7, "hour": 9},
                             "close": {"day": (TODAY + 1) % 7, "hour": 17}}]
            },
        },
        {   # 営業時間不明 → 通すが「営業時間未確認」タグが付くべき
            "id": "ChIJ_no_hours",
            "displayName": {"text": "時間不明の甘味処"},
            "types": ["cafe"],
            "location": {"latitude": 35.0038, "longitude": 135.7795},
        },
        {   # 深夜まで（日をまたぐ）→ close_hour=24 に丸められるべき
            "id": "ChIJ_late_bar",
            "displayName": {"text": "深夜バー"},
            "types": ["bar", "restaurant"],
            "location": {"latitude": 35.0030, "longitude": 135.7770},
            "regularOpeningHours": {
                "periods": [{"open": {"day": TODAY, "hour": 18},
                             "close": {"day": (TODAY + 1) % 7, "hour": 2}}]
            },
            "priceLevel": "PRICE_LEVEL_EXPENSIVE",
        },
        {   # 必須フィールド欠損 → 除外されるべき
            "id": "ChIJ_broken",
            "types": ["cafe"],
        },
    ]
}

spots = places.parse(PAYLOAD, ORIGIN)
by_id = {s.id: s for s in spots}

print(f"変換結果: {len(spots)}件 (入力6件)\n")
for s in spots:
    print(f"  {s.name:12} indoor={str(s.indoor):5} {s.open_hour:2}-{s.close_hour:2}時 "
          f"徒歩{s.travel_minutes:2}分 {s.price_yen:5}円 {s.category:10} {','.join(s.tags)}")

print()
fails = []


def check(label, cond):
    print(f"  {'OK  ' if cond else 'NG  '} {label}")
    if not cond:
        fails.append(label)


check("定休日の店が除外される", "ChIJ_closed_today" not in by_id)
check("必須フィールド欠損が除外される", "ChIJ_broken" not in by_id)
check("美術館が屋内判定", by_id["ChIJ_museum"].indoor is True)
check("公園が屋外判定（tourist_attractionに引きずられない）", by_id["ChIJ_park"].indoor is False)
check("屋内には「雨でも快適」が付く", "雨でも快適" in by_id["ChIJ_museum"].tags)
check("屋外には「雨でも快適」が付かない", "雨でも快適" not in by_id["ChIJ_park"].tags)
check("priceLevel→円に変換", by_id["ChIJ_museum"].price_yen == 1000)
check("EXPENSIVE→8000円", by_id["ChIJ_late_bar"].price_yen == 8000)
check("priceLevel未設定は既定値", by_id["ChIJ_no_hours"].price_yen == places.PRICE_UNKNOWN)
check("営業時間不明にタグが付く", "営業時間未確認" in by_id["ChIJ_no_hours"].tags)
check("営業時間判明時はタグが付かない", "営業時間未確認" not in by_id["ChIJ_museum"].tags)
check("closeなし=24時間営業", (by_id["ChIJ_park"].open_hour, by_id["ChIJ_park"].close_hour) == (0, 24))
check("日跨ぎ営業はclose=24に丸める", by_id["ChIJ_late_bar"].close_hour == 24)
check("editorialSummaryがblurbに入る", by_id["ChIJ_museum"].blurb == "近代美術を集めた市立美術館。")
check("summary無しでもblurbが埋まる", bool(by_id["ChIJ_park"].blurb))
check("travel_minutesが正の整数", all(s.travel_minutes >= 1 for s in spots))
check("tagsに重複がない", all(len(s.tags) == len(set(s.tags)) for s in spots))

# SpotSet と組み合わせて、検算のID照合が Places 由来のIDで動くか
import catalog  # noqa: E402
from schemas import Constraints  # noqa: E402

ss = catalog.SpotSet(spots, "places")
# 拠点駅起点の都道府県スケールに合わせた上限
c = Constraints(indoor_required=True, max_travel_minutes=90, max_spend_yen=5000,
                avoid_tags=[], prefer_tags=["雨でも快適"], reasoning="test")
hits = ss.search(c, "walk", 14)
print()
check("SpotSetがPlaces由来スポットを絞り込める", len(hits) > 0)
check("屋内必須フィルタで公園が落ちる", all(s.indoor for s in hits))
check("by_idでPlaces IDを引ける", ss.by_id.get("ChIJ_museum") is not None)

print(f"\n{'全て通過' if not fails else '失敗: ' + str(fails)}")
sys.exit(1 if fails else 0)
