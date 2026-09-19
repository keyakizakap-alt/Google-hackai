from enum import Enum

from pydantic import BaseModel, Field


class TroubleKind(str, Enum):
    rain = "rain"
    transit_down = "transit_down"
    crowded = "crowded"
    closed = "closed"
    unwell = "unwell"
    free_text = "free_text"


class Mobility(str, Enum):
    walk = "walk"
    transit = "transit"
    taxi = "taxi"
    car = "car"


class RecoveryRequest(BaseModel):
    trouble: TroubleKind
    # プロンプトへそのまま渡るため、トークン量が青天井にならないよう上限を設ける
    note: str = Field(default="", max_length=200)
    area: str = Field(default="kyoto", max_length=32)
    minutes_left: int = Field(default=180, ge=10, le=720)
    budget_yen: int = Field(default=6000, ge=0, le=200000)
    mobility: Mobility = Mobility.walk
    party: str = "couple"


class Constraints(BaseModel):
    """Step 1 の出力。エージェントが状況から導いた制約。"""

    indoor_required: bool
    # 都道府県スケールの移動を含むため上限は広く取る（東山の徒歩圏前提ではない）
    max_travel_minutes: int = Field(ge=0, le=240)
    max_spend_yen: int = Field(ge=0)
    avoid_tags: list[str]
    prefer_tags: list[str]
    reasoning: str


class PlanStep(BaseModel):
    spot_id: str
    arrive_after_minutes: int = Field(ge=0)
    stay_minutes: int = Field(ge=0)
    note: str


class Plan(BaseModel):
    title: str
    concept: str
    steps: list[PlanStep]
    why_now: str


class PlanSet(BaseModel):
    plans: list[Plan]


class VerifiedPlan(BaseModel):
    title: str
    concept: str
    why_now: str
    steps: list[dict]
    total_minutes: int
    total_yen: int
    passed: bool
    issues: list[str]


class AdoptRequest(BaseModel):
    """どの案が実際に採用されたかの記録。

    要件定義書のKPI「トラブル解決率（採用率70%以上）」と
    「Time to Recovery」を計測するための唯一の導線。
    """

    request_id: str = Field(max_length=64)
    plan_index: int = Field(ge=0, le=9)
    plan_title: str = Field(max_length=100)
    trouble: TroubleKind
    time_to_recovery_ms: int = Field(ge=0)
