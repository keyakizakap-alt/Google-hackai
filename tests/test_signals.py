"""外部シグナル層を、実APIを叩かずに検証する。

気象庁のエンドポイントはこの実行環境から到達できないため、
公開仕様どおりに組んだモックレスポンスでパーサを確認している。
実APIとの突き合わせは WEATHER_SOURCE=jma を設定して行う必要がある。
"""

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import signals  # noqa: E402
import spots_data  # noqa: E402

fails = []


def check(label, cond):
    print(f"  {'OK  ' if cond else 'NG  '} {label}")
    if not cond:
        fails.append(label)


# --- 天気文言の分類 ---------------------------------------------------------
print("天気文言の分類")
for text, expected in [
    ("晴れ", "clear"),
    ("くもり", "cloudy"),
    ("雨", "rain"),
    ("雪", "snow"),
    ("くもり 時々 雨", "rain"),        # 複合表現は影響の大きい方を採る
    ("雨 のち 雪", "snow"),            # 雪を優先する
    ("晴れ 時々 くもり", "clear"),
    ("", "unknown"),
]:
    got = signals.classify_weather(text)
    check(f"「{text or '(空)'}」→ {expected}", got == expected)


# --- 気象庁レスポンスのパース -----------------------------------------------
print("\n気象庁レスポンスのパース")

JMA_PAYLOAD = [
    {
        "publishingOffice": "京都地方気象台",
        "reportDatetime": "2026-09-19T05:00:00+09:00",
        "timeSeries": [
            {
                "timeDefines": ["2026-09-19T06:00:00+09:00"],
                "areas": [
                    {
                        "area": {"name": "南部", "code": "260010"},
                        "weatherCodes": ["202"],
                        "weathers": ["くもり　時々　雨"],
                        "winds": ["北の風"],
                    }
                ],
            }
        ],
    },
    {"timeSeries": []},
]

sit = signals.parse_jma(JMA_PAYLOAD)
check("Situation が返る", sit is not None)
check("weather が rain", sit.weather == "rain")
check("全角スペースが半角に正規化される", sit.weather_text == "くもり 時々 雨")
check("source に jma が入る", sit.sources == ["jma"])
check("トラブル種別を rain と推定する", sit.suggested_trouble() == "rain")

check("空配列で None", signals.parse_jma([]) is None)
check("timeSeries 欠損で None", signals.parse_jma([{"timeSeries": []}]) is None)
check("想定外の型で None", signals.parse_jma([{"timeSeries": [{"areas": []}]}]) is None)


# --- 運行情報の推定 ---------------------------------------------------------
print("\nトラブル種別の推定")
check(
    "運行停止は雨より優先される",
    signals.Situation(weather="rain", transit_disrupted=True).suggested_trouble() == "transit_down",
)
check("雪も rain 扱いで提案する", signals.Situation(weather="snow").suggested_trouble() == "rain")
check("晴れなら推定しない", signals.Situation(weather="clear").suggested_trouble() is None)
check("何も無ければ推定しない", signals.Situation().suggested_trouble() is None)


# --- エリア対応 -------------------------------------------------------------
print("\nエリア対応")
missing = set(spots_data.AREAS) - set(signals.JMA_AREA_CODE)
check("全47都道府県に気象庁コードがある", not missing)
check("未知のエリアは known_area が False", not signals.known_area("atlantis"))


# --- 失敗時の挙動 -----------------------------------------------------------
print("\n取得失敗時の挙動")


async def _boom(area):
    raise RuntimeError("接続できません")


orig = signals.PROVIDERS["weather"].get("mock")
signals.PROVIDERS["weather"]["_boom"] = _boom
signals.WEATHER_SOURCE = "_boom"
sit = asyncio.run(signals.detect("kyoto"))
check("プロバイダが例外でも detect は落ちない", isinstance(sit, signals.Situation))
check("失敗時は空の Situation", sit.weather is None and sit.sources == [])
signals.WEATHER_SOURCE = "mock"

check("未登録ソースは黙って無視される", isinstance(asyncio.run(signals.detect("kyoto")), signals.Situation))


# --- マージ -----------------------------------------------------------------
print("\n気象と運行のマージ")
signals.WEATHER_SOURCE = "mock"
signals.TRANSIT_SOURCE = "mock"
merged = asyncio.run(signals.detect("kyoto"))
check("両方のソースが記録される", len(merged.sources) == 2)
check("天気が入る", merged.weather is not None)
check("運行状況が入る", merged.transit_disrupted is not None)

print(f"\n{'全て通過' if not fails else '失敗: ' + str(fails)}")
sys.exit(1 if fails else 0)
