"""外部シグナル（気象・運行情報）の取り込み層。

要件定義書の F-01「リアルタイム状況検知」に対応する。
ユーザーがトラブルを申告する前に、いま何が起きているかを外部APIから拾う。

供給元は環境変数で差し替える。新しいAPIを足すときに書くのは
「レスポンス→Situation の変換関数」だけで、エージェント側は触らない。

  WEATHER_SOURCE = none(既定) | mock | jma
  TRANSIT_SOURCE = none(既定) | mock

追加手順:
  1. 下の PROVIDERS に (ソース名 → 非同期関数) を登録する
  2. その関数が Situation を返す。取得できなければ None を返す
  3. 環境変数でソース名を指定する

取得に失敗しても提案は止めない。シグナルはあくまで補助情報で、
無ければユーザーの申告だけで動く設計にしてある。
"""

import os
from dataclasses import dataclass, field

import httpx

import obs
import spots_data

WEATHER_SOURCE = os.environ.get("WEATHER_SOURCE", "none")
TRANSIT_SOURCE = os.environ.get("TRANSIT_SOURCE", "none")
TIMEOUT_SEC = float(os.environ.get("SIGNAL_TIMEOUT_SEC", "4"))


@dataclass
class Situation:
    """いまそのエリアで起きていること。すべて任意項目。"""

    weather: str | None = None  # "rain" | "snow" | "clear" | "cloudy"
    weather_text: str = ""
    transit_disrupted: bool | None = None
    transit_text: str = ""
    sources: list[str] = field(default_factory=list)

    def suggested_trouble(self) -> str | None:
        """検知内容から、ユーザーが選びそうなトラブル種別を推定する。"""
        if self.transit_disrupted:
            return "transit_down"
        if self.weather in ("rain", "snow"):
            return "rain"
        return None

    def as_dict(self) -> dict:
        return {
            "weather": self.weather,
            "weather_text": self.weather_text,
            "transit_disrupted": self.transit_disrupted,
            "transit_text": self.transit_text,
            "sources": self.sources,
            "suggested_trouble": self.suggested_trouble(),
        }


# --------------------------------------------------------------------------
# 気象: 気象庁
# --------------------------------------------------------------------------

JMA_ENDPOINT = "https://www.jma.go.jp/bosai/forecast/data/forecast/{code}.json"

# 都道府県コード → 気象庁の府県予報区コード。
# 北海道と鹿児島・沖縄は複数区に分かれるため、拠点を含む区を選んでいる。
JMA_AREA_CODE = {
    "hokkaido": "016000", "aomori": "020000", "iwate": "030000", "miyagi": "040000",
    "akita": "050000", "yamagata": "060000", "fukushima": "070000", "ibaraki": "080000",
    "tochigi": "090000", "gunma": "100000", "saitama": "110000", "chiba": "120000",
    "tokyo": "130000", "kanagawa": "140000", "niigata": "150000", "toyama": "160000",
    "ishikawa": "170000", "fukui": "180000", "yamanashi": "190000", "nagano": "200000",
    "gifu": "210000", "shizuoka": "220000", "aichi": "230000", "mie": "240000",
    "shiga": "250000", "kyoto": "260000", "osaka": "270000", "hyogo": "280000",
    "nara": "290000", "wakayama": "300000", "tottori": "310000", "shimane": "320000",
    "okayama": "330000", "hiroshima": "340000", "yamaguchi": "350000", "tokushima": "360000",
    "kagawa": "370000", "ehime": "380000", "kochi": "390000", "fukuoka": "400000",
    "saga": "410000", "nagasaki": "420000", "kumamoto": "430000", "oita": "440000",
    "miyazaki": "450000", "kagoshima": "460100", "okinawa": "471000",
}


def classify_weather(text: str) -> str:
    """気象庁の天気文言をアプリ内の区分へ落とす。

    「曇り時々雨」のような複合表現があるため、影響の大きい順に判定する。
    """
    if "雪" in text:
        return "snow"
    if "雨" in text:
        return "rain"
    if "晴" in text:
        return "clear"
    if "曇" in text or "くもり" in text:
        return "cloudy"
    return "unknown"


def parse_jma(payload: list) -> Situation | None:
    """気象庁のレスポンスから今日の天気を取り出す（テストから直接呼べるよう分離）。"""
    try:
        areas = payload[0]["timeSeries"][0]["areas"]
        text = areas[0]["weathers"][0]
    except (IndexError, KeyError, TypeError):
        return None

    text = text.replace("　", " ").strip()
    return Situation(weather=classify_weather(text), weather_text=text, sources=["jma"])


async def _weather_jma(area: str) -> Situation | None:
    code = JMA_AREA_CODE.get(area)
    if code is None:
        return None
    async with httpx.AsyncClient(timeout=TIMEOUT_SEC) as client:
        res = await client.get(JMA_ENDPOINT.format(code=code))
    res.raise_for_status()
    return parse_jma(res.json())


async def _weather_mock(area: str) -> Situation | None:
    """デモ用。エリア名から決定的に天気を作る（毎回同じ結果になる）。"""
    kinds = ["clear", "cloudy", "rain", "snow"]
    kind = kinds[sum(map(ord, area)) % len(kinds)]
    label = {"clear": "晴れ", "cloudy": "くもり", "rain": "雨", "snow": "雪"}[kind]
    return Situation(weather=kind, weather_text=f"{label}（モック）", sources=["mock"])


# --------------------------------------------------------------------------
# 運行情報
# --------------------------------------------------------------------------
#
# 実APIを入れる場合はここに変換関数を足す。候補:
#   - 公共交通オープンデータセンター（要登録・APIキー）
#   - 各鉄道事業者の運行情報フィード
# いずれも利用規約と認証方式が事業者ごとに違うため、
# 取得部分だけを差し替えられるようこの形にしてある。


async def _transit_mock(area: str) -> Situation | None:
    """デモ用。一部エリアだけ運行停止扱いにする。"""
    disrupted = sum(map(ord, area)) % 5 == 0
    return Situation(
        transit_disrupted=disrupted,
        transit_text="一部路線で運転見合わせ（モック）" if disrupted else "平常運転（モック）",
        sources=["mock"],
    )


# --------------------------------------------------------------------------
# レジストリ
# --------------------------------------------------------------------------

PROVIDERS = {
    "weather": {"jma": _weather_jma, "mock": _weather_mock},
    "transit": {"mock": _transit_mock},
}


def _merge(base: Situation, add: Situation | None) -> Situation:
    if add is None:
        return base
    return Situation(
        weather=add.weather or base.weather,
        weather_text=add.weather_text or base.weather_text,
        transit_disrupted=(
            base.transit_disrupted if add.transit_disrupted is None else add.transit_disrupted
        ),
        transit_text=add.transit_text or base.transit_text,
        sources=base.sources + add.sources,
    )


async def detect(area: str, request_id: str = "") -> Situation:
    """設定された供給元からシグナルを集める。失敗しても空の Situation を返す。"""
    result = Situation()

    for kind, source in (("weather", WEATHER_SOURCE), ("transit", TRANSIT_SOURCE)):
        fn = PROVIDERS.get(kind, {}).get(source)
        if fn is None:
            continue
        try:
            result = _merge(result, await fn(area))
        except Exception as e:
            # シグナルは補助情報。取れなくても提案は続行する
            obs.warn(
                f"signal.{kind}_failed",
                request_id=request_id,
                source=source,
                area=area,
                error=type(e).__name__,
                detail=str(e)[:200],
            )

    if result.sources:
        obs.info(
            "signal.detected",
            request_id=request_id,
            area=area,
            weather=result.weather,
            transit_disrupted=result.transit_disrupted,
            sources=result.sources,
        )
    return result


def is_enabled() -> bool:
    return WEATHER_SOURCE != "none" or TRANSIT_SOURCE != "none"


def known_area(area: str) -> bool:
    return area in spots_data.AREAS
