"""
Deck charts: how close the engine gets to the experts, on the LOCKED held-out test set. Aggregates only.

    .venv/bin/python docs/deck/charts.py            # uses cached aggregates if present
    .venv/bin/python docs/deck/charts.py --refresh  # recompute the consumption-band aggregates (retrains once)

Inputs (all derived, never committed):
  engine/artifacts/eval_results.json   same JSON as GET /eval (python -m engine.train)
  engine.error_analysis.run/seg_table  Cala's per-band breakdown (consumption band); only its aggregate table is used
Output: docs/deck/out/*.png + *.svg (git-ignored) and docs/deck/out/aggregates.json (numbers behind every bar).

Style: Reonic tokens (docs/design/tokens.json). Model = AI orange, comparison = neutral gray (emphasis pattern),
every bar value-labelled (orange is below 3:1 on the surface, so labels carry the reading), one message per title.
"""
from __future__ import annotations

import argparse
import json
import sys
import textwrap
from pathlib import Path

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
EVAL = ROOT / "engine" / "artifacts" / "eval_results.json"
OUT = Path(__file__).resolve().parent / "out"
MODEL = "design_model"
INSTALLER = {"2a8ba8e2": "Installer A", "23c108b7": "Installer B"}  # no Reonic ids on slides

TOKENS = {t["name"]: t["value"]["light"] for t in json.loads((ROOT / "docs/design/tokens.json").read_text())["color"]["tokens"]}
SURFACE, INK, INK_BODY, MUTED, GRID = TOKENS["surface-0"], TOKENS["ink"], TOKENS["ink-body"], TOKENS["ink-muted"], TOKENS["border"]
C_MODEL, C_BASE = TOKENS["ai-orange"], TOKENS["border-strong"]

plt.rcParams.update({
    "font.family": ["Geist", "Inter", "Helvetica Neue", "Arial", "DejaVu Sans"],
    "font.size": 12, "text.color": INK_BODY, "axes.labelcolor": MUTED, "xtick.color": MUTED, "ytick.color": MUTED,
    "axes.edgecolor": GRID, "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "svg.fonttype": "none",
})


def best_baseline(results_block: dict, baselines: list[str], metric: str, lower_is_better: bool) -> tuple[str, float]:
    vals = {b: results_block[b][metric] for b in baselines if results_block.get(b, {}).get(metric) is not None}
    name = (min if lower_is_better else max)(vals, key=vals.get)
    return name, vals[name]


BASELINE_LABEL = {"baseline_kwh_per_1000": "kWh ÷ 1000 rule", "baseline_band_median": "median of similar homes",
                  "baseline_kwp_per_mwh": "installer's kWp-per-MWh ratio"}


def _axes(title: str, subtitle: str, figsize=(9, 5)):
    fig, ax = plt.subplots(figsize=figsize)
    fig.subplots_adjust(top=0.72, bottom=0.14, left=0.08, right=0.98)
    fig.text(0.08, 0.935, title, fontsize=17, fontweight="semibold", color=INK, ha="left")
    fig.text(0.08, 0.905, textwrap.fill(subtitle, 118), fontsize=10.5, color=MUTED, ha="left", va="top", linespacing=1.4)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(length=0)
    return fig, ax


def grouped_bars(ax, groups: list[str], series: list[tuple[str, list[float], str]], fmt: str, width=0.34, gap=0.02):
    """series = [(label, values, colour)]; adjacent bars separated by a surface gap; every bar value-labelled."""
    n = len(series)
    for i, (label, values, colour) in enumerate(series):
        xs = [g + (i - (n - 1) / 2) * (width + gap) for g in range(len(groups))]
        bars = ax.bar(xs, values, width=width, color=colour, label=label, zorder=2)
        for bar, v in zip(bars, values):
            ax.annotate(fmt.format(v), (bar.get_x() + bar.get_width() / 2, bar.get_height()), xytext=(0, 4),
                        textcoords="offset points", ha="center", va="bottom", fontsize=11, color=INK, fontweight="medium")
    ax.set_xticks(range(len(groups)), groups)
    ax.figure.legend(frameon=False, loc="upper left", bbox_to_anchor=(0.075, 0.80), ncols=n, fontsize=11,
                     labelcolor=INK_BODY, handlelength=1.0)
    ax.margins(y=0.18)


def save(fig, name: str, files: list[str]):
    OUT.mkdir(parents=True, exist_ok=True)
    for ext in ("png", "svg"):
        path = OUT / f"{name}.{ext}"
        fig.savefig(path, dpi=200 if ext == "png" else None, facecolor=SURFACE)
        files.append(str(path.relative_to(ROOT)))
    plt.close(fig)


def band_aggregates() -> list[dict]:
    """PV MAE per consumption band from Cala's error analysis (shipped model, planner answered the existing-PV question)."""
    from engine.error_analysis import run, seg_table

    t = run(True)
    # homes left at the 4,500 kWh default (all fall in the 3-4.5k band) get their own bar: "consumption unknown"
    order = ["<3k", "3-4.5k", "4.5-6k", "6-9k", ">9k", "unknown"]
    t["band"] = pd.Categorical(t.band.astype(str).where(~t.demand_is_default.fillna(False).astype(bool), "unknown"), order)
    t = seg_table(t, "band")
    return [{"band": str(b), "n": int(r["n"]), "pv_mae_both": float(r["PV MAE (both)"]),
             "pv_bias_both": float(r["PV bias (both)"])} for b, r in t.iterrows()]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="recompute consumption-band aggregates")
    args = ap.parse_args(argv)
    r = json.loads(EVAL.read_text())
    bl, n_test = r["baselines"], r["protocol"]["n_test"]
    cache = OUT / "aggregates.json"
    agg = json.loads(cache.read_text()) if cache.exists() and not args.refresh else {}
    if not any(b["band"] == "unknown" for b in agg.get("bands", [])):
        agg["bands"] = band_aggregates()
    files: list[str] = []
    note = f"{n_test} held-out real projects"
    ans = r["with_existing_pv_answer"]  # the planner answered "Is there already PV on the roof?" (the product flow)
    asked = "planner answered \"PV already on the roof?\""

    # 1 — PV size error, model vs best baseline, new systems vs add-on sales
    metric = "pv_kwp_mae_all_projects"
    blocks = [("All projects", ans["metrics"]), ("New systems", ans["segments"]["full_designs"]),
              ("Add-on sales", ans["segments"]["add_ons"])]
    rows = []
    for label, block in blocks:
        bname, bval = best_baseline(block, bl, metric, True)
        rows.append(dict(group=label, model=block[MODEL][metric], baseline=bval, baseline_name=bname,
                         n=int(block[MODEL]["n_projects"])))
    agg["pv_mae_by_segment"] = rows
    new = rows[1]
    verdict = "beats" if new["model"] < new["baseline"] else "does not yet beat"
    fig, ax = _axes(f"New systems: engine {verdict} the best rule of thumb on PV size",
                    f"PV size error vs the expert, kWp, lower is better (a PV the expert did not sell counts) · {asked} · {note}")
    grouped_bars(ax, [f"{x['group']}\n{x['n']} projects" for x in rows],
                 [("Engine", [x["model"] for x in rows], C_MODEL),
                  ("Best baseline", [x["baseline"] for x in rows], C_BASE)], "{:.2f}")
    ax.set_ylabel("mean absolute error, kWp")
    save(fig, "1_pv_error_new_vs_addons", files)

    # 2a — PV error by consumption band (shipped model)
    bands = agg["bands"]
    worst = max(bands, key=lambda b: b["pv_mae_both"])
    unknown = next(b for b in bands if b["band"] == "unknown")
    fig, ax = _axes(f"PV size is hardest to match for {worst['band']} kWh homes",
                    f"PV size error where engine and expert both chose PV, kWp, by annual consumption · \"not entered\" = "
                    f"{unknown['n']} homes left at the 4,500 kWh default · {asked} · {note}")
    xs = range(len(bands))
    bars = ax.bar(xs, [b["pv_mae_both"] for b in bands], width=0.55, zorder=2,
                  color=[C_BASE if b["band"] == "unknown" else C_MODEL for b in bands])
    for bar, b in zip(bars, bands):
        ax.annotate(f"{b['pv_mae_both']:.2f}", (bar.get_x() + bar.get_width() / 2, bar.get_height()), xytext=(0, 4),
                    textcoords="offset points", ha="center", fontsize=11, color=INK, fontweight="medium")
    ax.set_xticks(list(xs), [("not entered" if b["band"] == "unknown" else f"{b['band']} kWh") + f"\n{b['n']} projects"
                             for b in bands])
    ax.set_ylabel("mean absolute error, kWp")
    ax.margins(y=0.18)
    save(fig, "2a_pv_error_by_consumption", files)

    # 2b — per installer (held out) and installer transfer (train on one, test on the other)
    metric = "pv_kwp_mae_when_both_pv"
    rows = []
    for inst, label in INSTALLER.items():
        block = {k: v.get(inst, {}) for k, v in r["by_installer"].items()}
        _, bval = best_baseline(block, bl, metric, True)
        rows.append(dict(group=f"{label}\nheld out", model=block[MODEL][metric], baseline=bval))
    for tname, block in r["transfer"].items():
        src, dst = tname.split("->")
        _, bval = best_baseline(block, bl, metric, True)
        rows.append(dict(group=f"{INSTALLER[src][-1]} → {INSTALLER[dst][-1]}\ntransfer", model=block[MODEL][metric], baseline=bval))
    agg["pv_mae_installer_transfer"] = rows
    wins = sum(x["model"] < x["baseline"] for x in rows)
    fig, ax = _axes(f"Works across installers: beats the baseline in {wins} of {len(rows)} tests",
                    f"PV size error where both chose PV, kWp · transfer = trained only on the other installer's projects · without the answer · {note}")
    grouped_bars(ax, [x["group"] for x in rows], [("Engine", [x["model"] for x in rows], C_MODEL),
                                                  ("Best baseline", [x["baseline"] for x in rows], C_BASE)], "{:.2f}")
    ax.set_ylabel("mean absolute error, kWp")
    save(fig, "2b_pv_error_installer_transfer", files)

    # 3 — asking the planner "Is there already PV on the roof?"
    metric = "pv_kwp_mae_all_projects"
    segs = [("All projects", r["metrics"], ans["metrics"]),
            ("New systems", r["segments"]["full_designs"], ans["segments"]["full_designs"]),
            ("Add-on sales", r["segments"]["add_ons"], ans["segments"]["add_ons"])]
    rows = [dict(group=label, before=b[MODEL][metric], after=a[MODEL][metric], n=int(a[MODEL]["n_projects"]))
            for label, b, a in segs]
    ot_before, ot_after = r["metrics"][MODEL]["offer_type_accuracy"], ans["metrics"][MODEL]["offer_type_accuracy"]
    agg["existing_pv_question"] = {"pv_mae": rows, "offer_type_accuracy": dict(before=ot_before, after=ot_after)}
    cut = 1 - rows[0]["after"] / rows[0]["before"]
    fig, ax = _axes(f"One question to the planner cuts PV error by {cut:.0%}",
                    f"Engine PV size error vs the expert, kWp, without vs with the answer to \"Is there already PV on the "
                    f"roof?\" (a PV the expert did not sell counts) · offer type right {ot_before:.0f}\u00a0% → {ot_after:.0f}\u00a0% · {note}")
    grouped_bars(ax, [f"{x['group']}\n{x['n']} projects" for x in rows],
                 [("Without the answer", [x["before"] for x in rows], C_BASE),
                  ("With the answer", [x["after"] for x in rows], C_MODEL)], "{:.2f}")
    ax.set_ylabel("mean absolute error, kWp")
    save(fig, "3_existing_pv_question", files)

    # 4 — variant-range hit rate: is the engine's size one the expert also offered (±1 kWp / ±1 battery step)?
    groups = [("pv_variant_hit_tolerant_pct", "PV", "full_designs", "new systems"),
              ("pv_variant_hit_tolerant_pct", "PV", "add_ons", "add-on sales"),
              ("battery_variant_hit_tolerant_pct", "Battery", "full_designs", "new systems"),
              ("battery_variant_hit_tolerant_pct", "Battery", "add_ons", "add-on sales")]
    rows = []
    for k, comp, seg, seg_label in groups:
        block = ans["segments"][seg]
        _, bval = best_baseline(block, bl, k, False)
        rows.append(dict(metric=k, segment=seg, group=f"{comp}\n{seg_label}", model=block[MODEL][k], baseline=bval))
    agg["variant_hit"] = rows
    pv_new, pv_add = rows[0], rows[1]
    lead = "level with" if abs(pv_new["model"] - pv_new["baseline"]) < 2 else (
        "ahead of" if pv_new["model"] > pv_new["baseline"] else "behind")
    fig, ax = _axes(f"In the expert's own options: {lead} the best rule on new systems",
                    f"Engine size within the expert's variant range (PV ±1 kWp, battery ±1 step), % of projects · "
                    f"PV new systems {pv_new['model']:.0f}\u00a0% vs {pv_new['baseline']:.0f}\u00a0%, add-on sales far ahead: {pv_add['model']:.0f}\u00a0% vs "
                    f"{pv_add['baseline']:.0f}\u00a0% · {asked} · {note}")
    grouped_bars(ax, [x["group"] for x in rows], [("Engine", [x["model"] for x in rows], C_MODEL),
                                                  ("Best baseline", [x["baseline"] for x in rows], C_BASE)], "{:.0f} %")
    ax.set_ylim(0, 100)
    ax.set_ylabel("% of held-out projects")
    save(fig, "4_variant_range_hit", files)

    agg["source"] = {"eval": "engine/artifacts/eval_results.json (= GET /eval)", "n_test": n_test,
                     "baselines": {b: BASELINE_LABEL.get(b, b) for b in bl}}
    cache.write_text(json.dumps(agg, indent=2))
    files.append(str(cache.relative_to(ROOT)))
    print("\n".join(files))


if __name__ == "__main__":
    main()
