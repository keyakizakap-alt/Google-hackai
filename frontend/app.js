const $ = (id) => document.getElementById(id);

const state = { trouble: "rain", area: "kyoto", requestId: null, startedAt: 0, adopted: false };

const STEP_LABEL = {
  assess: "状況把握",
  discover: "候補探索",
  compose: "プラン構成",
  verify: "自己検証",
  repair: "自己修正",
  reverify: "再検証",
};

/* ---------- 入力 ---------- */

document.querySelectorAll(".trouble").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".trouble").forEach((b) => b.classList.remove("is-on"));
    btn.classList.add("is-on");
    state.trouble = btn.dataset.trouble;
  });
});

const bind = (input, out, fmt) => {
  const sync = () => (out.textContent = fmt(input.value));
  input.addEventListener("input", sync);
  sync();
};

bind($("minutes"), $("v-time"), (v) => v);
bind($("budget"), $("v-budget"), (v) => Number(v).toLocaleString("ja-JP"));

/* ---------- エリア ---------- */

let AREAS = [];

(async function loadAreas() {
  const sel = $("area");
  try {
    const res = await fetch("/api/areas");
    AREAS = await res.json();
  } catch {
    // 一覧が取れなくても既定エリアで動かせるようにしておく
    AREAS = [{ code: "kyoto", name: "京都府", hub: "京都" }];
  }
  sel.innerHTML = AREAS.map(
    (a) => `<option value="${esc(a.code)}">${esc(a.name)}</option>`
  ).join("");
  sel.value = state.area;
  syncArea();
})();

function syncArea() {
  state.area = $("area").value;
  const a = AREAS.find((x) => x.code === state.area);
  $("area-hint").textContent = a ? `${a.hub}を起点に探します` : "";
}

$("area").addEventListener("change", syncArea);

/* ---------- 実行 ---------- */

$("go").addEventListener("click", run);

async function run() {
  const go = $("go");
  go.disabled = true;
  go.textContent = "考えています…";

  $("trace-panel").hidden = false;
  $("trace").innerHTML = "";
  $("raw").hidden = true;
  $("raw-body").innerHTML = "";
  $("plans").innerHTML = "";
  $("trace-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });

  state.startedAt = performance.now();
  state.adopted = false;

  const body = {
    trouble: state.trouble,
    area: state.area,
    note: $("note").value.trim(),
    minutes_left: Number($("minutes").value),
    budget_yen: Number($("budget").value),
    mobility: $("mobility").value,
    party: $("party").value,
  };

  try {
    const res = await fetch("/api/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`サーバーエラー (${res.status})`);
    await consume(res.body, handle);
  } catch (err) {
    $("plans").innerHTML = `<p class="empty">通信に失敗しました: ${esc(err.message)}</p>`;
  } finally {
    go.disabled = false;
    go.textContent = "逆転プランをつくる";
  }
}

/* ---------- SSE の読み取り ---------- */

async function consume(stream, onEvent) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      let name = "message";
      const data = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trim());
      }
      if (data.length) onEvent(name, JSON.parse(data.join("\n")));
    }
  }
}

/* ---------- イベント処理 ---------- */

function handle(name, data) {
  if (name === "start") {
    state.requestId = data.request_id;
    const el = $("mode");
    el.hidden = false;
    el.textContent =
      data.mode === "gemini"
        ? `Gemini (${data.model}) で生成`
        : "デモモード（APIキー未設定のためルールベースで動作）";
  }

  if (name === "step") upsertStep(data);
  if (name === "result") renderPlans(data);
  if (name === "error") {
    $("plans").innerHTML = `<p class="empty">${esc(data.message)}</p>`;
  }
}

function upsertStep(d) {
  let li = document.querySelector(`[data-step="${d.id}"]`);
  if (!li) {
    li = document.createElement("li");
    li.dataset.step = d.id;
    li.innerHTML = `<i class="dot"></i><div><div class="label"></div><div class="sub"></div></div>`;
    $("trace").appendChild(li);
  }
  li.className = d.state;
  li.querySelector(".label").textContent = STEP_LABEL[d.id] || d.id;
  li.querySelector(".sub").textContent = d.label || "";

  if (d.detail) renderDetail(d.id, d.detail);
}

function renderDetail(id, detail) {
  $("raw").hidden = false;
  const box = document.createElement("div");
  box.className = "raw-block";

  if (id === "assess") {
    box.innerHTML = `
      <h4>状況把握が決めた制約</h4>
      <p>${esc(detail.reasoning)}</p>
      <ul class="chips">
        <li>${detail.indoor_required ? "屋内必須" : "屋外可"}</li>
        <li>移動${detail.max_travel_minutes}分以内</li>
        <li>1件${Number(detail.max_spend_yen).toLocaleString("ja-JP")}円以内</li>
        ${detail.prefer_tags.map((t) => `<li>優先: ${esc(t)}</li>`).join("")}
        ${detail.avoid_tags.map((t) => `<li>回避: ${esc(t)}</li>`).join("")}
      </ul>`;
  } else if (id === "discover") {
    box.innerHTML = `
      <h4>候補として通過したスポット</h4>
      <ul class="chips">${detail.spots.map((s) => `<li>${esc(s.name)}</li>`).join("")}</ul>`;
  }

  $("raw-body").appendChild(box);
}

/* ---------- 結果 ---------- */

function renderPlans({ plans, rejected, repaired, elapsed_ms }) {
  const host = $("plans");

  if (!plans.length) {
    host.innerHTML = `<p class="empty">条件に合うプランを作れませんでした。時間や予算を広げてみてください。</p>`;
    return;
  }

  // デモモードはミリ秒未満で終わるため、秒表示だと 0.0 秒になってしまう
  const took = elapsed_ms < 100 ? `${Math.round(elapsed_ms)}ミリ秒` : `${(elapsed_ms / 1000).toFixed(1)}秒`;
  const repairNote = repaired ? ` / ${repaired}案は自己修正で成立させました` : "";
  host.innerHTML =
    `<p class="timing">${took}で${plans.length}案を提示${esc(repairNote)}</p>` +
    plans.map(card).join("");

  host.querySelectorAll("[data-adopt]").forEach((btn) => {
    btn.addEventListener("click", () => adopt(btn, plans[Number(btn.dataset.adopt)]));
  });

  const caught = rejected.flatMap((r) => r.issues);
  if (caught.length) {
    const g = document.createElement("div");
    g.className = "guard";
    g.innerHTML = `<strong>検証で弾いた提案</strong><ul>${caught
      .map((i) => `<li>${esc(i)}</li>`)
      .join("")}</ul>`;
    host.appendChild(g);
  }
}

function card(p, i) {
  return `
    <article class="plan">
      <h3>${esc(p.title)}</h3>
      <p class="concept">${esc(p.concept)}</p>
      <div class="meta">
        <span>所要 <b>${p.total_minutes}</b> 分</span>
        <span>概算 <b>${p.total_yen.toLocaleString("ja-JP")}</b> 円</span>
      </div>
      <ol class="steps">
        ${p.steps
          .map(
            (s) => `
          <li>
            <div class="top">
              <span class="name">${esc(s.name)}</span>
              <span class="when">${s.arrive_after_minutes}分後 / ${s.stay_minutes}分滞在</span>
            </div>
            <p class="blurb">${esc(s.note || s.blurb)}</p>
          </li>`
          )
          .join("")}
      </ol>
      <p class="why"><strong>今だからこそ</strong>${esc(p.why_now)}</p>
      <button class="adopt" data-adopt="${i}">このプランにする</button>
    </article>`;
}

/* ---------- 採用の記録（KPI計測の入口） ---------- */

async function adopt(btn, plan) {
  if (state.adopted) return;
  state.adopted = true;

  document.querySelectorAll(".adopt").forEach((b) => (b.disabled = true));
  btn.textContent = "このプランで向かいます";
  btn.classList.add("is-on");

  try {
    await fetch("/api/adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: state.requestId,
        plan_index: Number(btn.dataset.adopt),
        plan_title: plan.title,
        trouble: state.trouble,
        time_to_recovery_ms: Math.round(performance.now() - state.startedAt),
      }),
    });
  } catch {
    // 記録は計測用途なので、失敗してもユーザーの行動は妨げない
  }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
