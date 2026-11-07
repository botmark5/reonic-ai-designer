"""
engine/model.py - the design model: decides like an installer's planner.

Chain (decisions are coupled, like a planner thinks):
    1. heat pump  OPTION, not a default: the rule (physics.heatpump_recommendation) decides whether a heat pump
                  is OFFERED and which size; it is only included when the customer/planner chooses it (lock
                  heatpump_kw). Experts added one in only 11 of 24 gas/oil homes, so it is a budget/needs choice.
    2. PV yes/no + kWp (+ P10/P90)                        - sees total demand incl. EV + new heat pump
    3. battery yes/no + catalogue size                    - sees the PV size decided in step 2
    4. wallbox yes/no                                     - EV features only (barely predictable otherwise)
Locks: the planner can fix any component; everything AFTER it in the chain adapts.
Sizes snap to what the installer sells: batteries to its catalogue, PV to whole 450 W modules.

Interface for engine/evaluate.py: fit(table) / predict(df). For the API: propose(), similar_homes(), validate().
"""
from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier, LGBMRegressor

from engine import physics
from engine.evaluate import DESIGN_COLUMNS
from engine.features import build_features, clean_inputs, feature_text, offer_month
from engine.interim_labels import build_catalogue

ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
MODEL_PATH = ARTIFACTS / "design_model.joblib"
MODULE_KWP = 0.45            # PV snaps to whole modules of 450 W
SEED = 42


def _lgb(**extra):
    """Small, conservative trees: ~1,300 training projects, so avoid overfitting."""
    p = dict(n_estimators=300, learning_rate=0.03, num_leaves=15, min_child_samples=15, subsample=0.8,
             subsample_freq=1, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    p.update(extra)
    return p


def snap_pv(kwp: float) -> float:
    return round(round(kwp / MODULE_KWP) * MODULE_KWP, 2) if kwp > 0 else 0.0


def nearest(value: float, sizes) -> float:
    return float(min(sizes, key=lambda s: abs(s - value)))


class DesignModel:
    name = "design_model"

    # ------------------------------------------------------------------ training
    def fit(self, table: pd.DataFrame) -> "DesignModel":
        """table: one row per project = inputs + the expert (primary) design (see evaluate.build_eval_table)."""
        t = clean_inputs(table)
        t = t[t.annual_kwh.notna()].reset_index(drop=True)          # no demand -> cannot learn from it
        self.installers_ = sorted(t.installer.unique())
        self.catalogue_ = build_catalogue(t, min_count=3)
        # new projects are dated "today", after all training data; the last months are unusual (April 2026 =
        # a batch of battery-only retrofits), so dates are capped at the 90th percentile of training dates
        has_dates = "offer_date" in t and t.offer_date.notna().any()
        self.offer_month_cap_ = float(offer_month(t.offer_date).quantile(0.9)) if has_dates else None

        # training uses the heat pump the expert actually installed ("with X kW heat pump, experts chose Y kWp")
        X = build_features(t, t.heatpump_kw, self.installers_, self.offer_month_cap_)
        self.features_ = list(X.columns)
        self.wallbox_features_ = [c for c in X.columns if c.startswith("inst_")] + ["has_ev", "ev_km", "existing_wallbox"]

        self.has_pv_ = LGBMClassifier(**_lgb()).fit(X, t.has_pv.astype(int))
        pv = t.has_pv.astype(bool).to_numpy()
        # PV size: simpler trees + Huber loss (robust to outliers like MAE) + monotonic constraints:
        # more consumption / an EV / more driving never makes the PV smaller (without them, the few EV
        # projects produced "EV added -> PV shrinks" artefacts). 5-fold CV MAE 2.60 kWp (band median: 2.69).
        # LightGBM allows monotonic constraints only with L2/Huber, not with MAE or quantile losses.
        increasing = {"total_demand_kwh", "annual_kwh", "has_ev", "ev_km"}
        pv_params = dict(num_leaves=7, min_child_samples=40, n_estimators=500, learning_rate=0.02)
        self.pv_ = LGBMRegressor(**_lgb(objective="huber", alpha=2.0, **pv_params,
                                        monotone_constraints=[1 if c in increasing else 0 for c in X.columns],
                                        monotone_constraints_method="advanced")).fit(X[pv], t.pv_kwp[pv])
        # P10/P90 range (unconstrained; propose() widens the range so it always contains the point estimate)
        self.pv_q_ = {q: LGBMRegressor(**_lgb(objective="quantile", alpha=q / 100, **pv_params)).fit(X[pv], t.pv_kwp[pv])
                      for q in (10, 90)}

        # battery sees the EXPERT's PV during training (teacher forcing), our PV / the planner's lock at prediction
        Xb = X.assign(pv_kwp_planned=t.pv_kwp.fillna(0).to_numpy())
        self.has_battery_ = LGBMClassifier(**_lgb()).fit(Xb, t.has_battery.astype(int))
        bat = t.has_battery.astype(bool).to_numpy()
        y = [nearest(k, self.catalogue_[i]["battery_kwh"] or [k]) for k, i in zip(t.battery_kwh[bat], t.installer[bat])]
        # classes as whole tenths of a kWh (10.2 kWh -> 102): sklearn rejects float class labels
        self.battery_ = LGBMClassifier(**_lgb(min_child_samples=8)).fit(Xb[bat], np.round(np.asarray(y) * 10).astype(int))
        self.battery_kwh_ = self.battery_.classes_ / 10.0          # class index -> kWh

        self.wallbox_ = LGBMClassifier(**_lgb(num_leaves=7, min_child_samples=30)).fit(
            X[self.wallbox_features_], t.has_wallbox.astype(int))

        keep = ["project_id", "installer", "annual_kwh", "has_ev", "pv_kwp", "battery_kwh", "has_pv", "has_battery",
                "has_wallbox", "heatpump_kw"]
        self.reference_ = t[[c for c in keep if c in t]].assign(total_demand_kwh=X.total_demand_kwh.to_numpy())
        self.n_train_ = len(t)
        return self

    # ------------------------------------------------------------------ the chain
    def _heatpump(self, row) -> tuple[float, list[str], float]:
        cat = self.catalogue_.get(row.get("installer"), {})
        sells = cat.get("sells_heatpumps", True)
        sizes = cat.get("heatpump_kw") or list(physics.HP_CATALOGUE_KW)
        demand = row.get("heating_demand_kwh")
        demand = None if demand is None or pd.isna(demand) else float(demand)
        rec = physics.heatpump_recommendation(row.get("heating"), demand, sells, sizes)
        if rec["include"] and rec["kw"] is None:          # candidate, but heat demand unknown
            rec["kw"] = 10.0 if 10.0 in sizes else nearest(10, sizes)
            rec["reasons"].append(f"Using the most common size ({rec['kw']:g} kW) until the heat demand is known.")
        # gas/oil homes got a heat pump in ~11 of 24 cases at installer 2a8ba8e2 -> a real choice, not a default
        conf = 0.5 if rec["include"] else 0.95
        return (rec["kw"] or 0.0) if rec["include"] else 0.0, rec["reasons"], conf

    def heatpump_option(self, home: dict, installer: str) -> dict:
        """Is a heat pump OFFERED for this home, and which size? (included only when chosen via the lock)"""
        kw, reasons, _ = self._heatpump(pd.Series(home_to_row(home, installer)))
        return dict(available=kw > 0, kw=kw or None, reasons=reasons)

    def _battery_proba(self, Xb: pd.DataFrame, installer: str) -> np.ndarray:
        """Battery size probabilities restricted to what THIS installer sells (snap to catalogue)."""
        proba = self.battery_.predict_proba(Xb)
        sizes = self.catalogue_.get(installer, {}).get("battery_kwh")
        if sizes:
            mask = np.isin(np.round(self.battery_kwh_, 1), np.round(sizes, 1))
            if mask.any():
                proba = proba * mask
                proba = proba / proba.sum(axis=1, keepdims=True)
        return proba

    def _run(self, homes: pd.DataFrame, locks: dict | None = None) -> pd.DataFrame:
        """Full chain for a table of homes. locks apply to every row (used by propose for one home)."""
        locks = {k: v for k, v in (locks or {}).items() if v is not None}
        out = pd.DataFrame(index=homes.index)
        # heat pump only when chosen (lock); otherwise it is offered as an option by propose()/the API
        out["heatpump_kw"] = float(locks.get("heatpump_kw", 0.0))
        X = build_features(homes, out.heatpump_kw.to_numpy(), self.installers_, self.offer_month_cap_)
        out["p_has_pv"] = self.has_pv_.predict_proba(X)[:, 1]
        out["pv_raw"] = self.pv_.predict(X)
        out["pv_p10"], out["pv_p90"] = self.pv_q_[10].predict(X), self.pv_q_[90].predict(X)
        if "pv_kwp" in locks:
            out["has_pv"] = float(locks["pv_kwp"]) > 0
            out["pv_kwp"] = float(locks["pv_kwp"])
        else:
            out["has_pv"] = out.p_has_pv >= 0.5
            out["pv_kwp"] = np.where(out.has_pv, [snap_pv(v) for v in out.pv_raw], 0.0)
        Xb = X.assign(pv_kwp_planned=out.pv_kwp.to_numpy())
        out["p_has_battery"] = self.has_battery_.predict_proba(Xb)[:, 1]
        sizes, probs = [], []
        for idx, (_, r) in enumerate(homes.iterrows()):
            p = self._battery_proba(Xb.iloc[[idx]], r.get("installer"))[0]
            sizes.append(float(self.battery_kwh_[int(np.argmax(p))]))
            probs.append(p)
        out["battery_best"] = sizes
        if "battery_kwh" in locks:
            out["has_battery"] = float(locks["battery_kwh"]) > 0
            out["battery_kwh"] = float(locks["battery_kwh"])
        else:
            out["has_battery"] = out.p_has_battery >= 0.5
            out["battery_kwh"] = np.where(out.has_battery, out.battery_best, 0.0)
        out["p_has_wallbox"] = self.wallbox_.predict_proba(X[self.wallbox_features_])[:, 1]
        out["has_wallbox"] = bool(locks["wallbox"]) if "wallbox" in locks else out.p_has_wallbox >= 0.5
        out["has_heatpump"] = out.heatpump_kw > 0
        self._last = dict(X=X, Xb=Xb, battery_proba=probs)        # kept for explanations of a single home
        return out

    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """Harness interface: predicted design per row (no locks)."""
        if len(df) == 0:
            return pd.DataFrame(columns=DESIGN_COLUMNS)
        return self._run(df)[DESIGN_COLUMNS]

    # ------------------------------------------------------------------ explanations
    def _drivers(self, model, X: pd.DataFrame, unit: str, class_index: int | None = None, top: int = 3) -> list[str]:
        """Top features behind ONE prediction (exact tree SHAP values via LightGBM pred_contrib)."""
        contrib = np.asarray(model.predict(X, pred_contrib=True))
        n = X.shape[1]
        if class_index is not None:
            contrib = contrib.reshape(len(X), -1, n + 1)[:, class_index, :]
        c = pd.Series(contrib[0, :n], index=X.columns)
        c = c[c.abs() > 1e-6]
        c = c.reindex(c.abs().sort_values(ascending=False).index).head(top)
        out = []
        for f, v in c.items():
            val = X.iloc[0][f]
            shown = ("" if f.startswith("inst_") else f" ({_fmt(f, val)})")
            out.append(f"{feature_text(f)}{shown} {'+' if v > 0 else ''}{v:.1f} kWp" if unit == "kWp"
                       else f"{feature_text(f)}{shown} speaks {'for' if v > 0 else 'against'} {unit}")
        return out

    # ------------------------------------------------------------------ API: one home
    def propose(self, home: dict, installer: str, locks: dict | None = None) -> dict:
        """Complete design for one home in docs/api.md shape (+ engine facts for the explanation)."""
        locks = {k: v for k, v in (locks or {}).items() if v is not None}
        row = pd.DataFrame([home_to_row(home, installer)])
        r = self._run(row, locks).iloc[0]
        X, Xb, proba = self._last["X"], self._last["Xb"], self._last["battery_proba"][0]
        classes = self.battery_kwh_
        design, facts = {}, {"locks": locks, "installer": installer}

        # heat pump: an option the customer chooses (budget / needs); included only when locked
        option = self.heatpump_option(home, installer)
        if locks.get("heatpump_kw"):
            hp_reasons = [f"Chosen by the customer/planner: {locks['heatpump_kw']:g} kW."] + option["reasons"][1:]
        elif "heatpump_kw" in locks:
            hp_reasons = ["Not chosen: no heat pump in this design."]
        elif option["available"]:
            hp_reasons = [f"Optional: a {option['kw']:g} kW heat pump can replace the {home.get('heating')} heating. "
                          "Not included by default; the customer decides based on budget and needs "
                          "(experts added one in about half of similar homes)."] + option["reasons"][1:]
        else:
            hp_reasons = option["reasons"]
        design["heatpump"] = dict(include=bool(r.heatpump_kw > 0), kw=float(r.heatpump_kw) or None,
                                  confidence=1.0 if "heatpump_kw" in locks else (0.5 if option["available"] else 0.95),
                                  reasons=hp_reasons, option=option)

        # PV
        lo, hi = sorted([float(r.pv_p10), float(r.pv_p90)])
        lo, hi = snap_pv(min(lo, r.pv_raw)), snap_pv(max(hi, r.pv_raw))
        if "pv_kwp" in locks:
            pv_reasons, pv_conf = [f"Fixed by the planner: {r.pv_kwp:g} kWp." if r.pv_kwp else "Fixed by the planner: no PV."], 1.0
        elif r.has_pv:
            pv_conf = float(r.p_has_pv)
            pv_reasons = [f"{r.p_has_pv:.0%} of similar homes got PV; size {r.pv_kwp:g} kWp "
                          f"(~{round(r.pv_kwp / MODULE_KWP)} modules of 450 W), typical range {lo:g}-{hi:g} kWp."]
            pv_reasons += ["Main drivers: " + "; ".join(self._drivers(self.pv_, X, "kWp")) + "."]
        else:
            pv_conf = 1 - float(r.p_has_pv)
            pv_reasons = [f"No new PV: only {r.p_has_pv:.0%} of similar projects got PV (typical: battery add-on to an existing system).",
                          "Main drivers: " + "; ".join(self._drivers(self.has_pv_, X, "PV")) + "."]
        design["pv"] = dict(include=bool(r.has_pv), kwp=float(r.pv_kwp) if r.has_pv else None, range=[lo, hi],
                            confidence=round(pv_conf, 2), reasons=pv_reasons)

        # battery
        cdf = np.cumsum(proba)
        b_lo = float(classes[min(np.searchsorted(cdf, 0.1), len(classes) - 1)])
        b_hi = float(classes[min(np.searchsorted(cdf, 0.9), len(classes) - 1)])
        best = int(np.argmax(proba))
        alternatives = [dict(kwh=float(classes[i]), share=round(float(proba[i]), 2))
                        for i in np.argsort(proba)[::-1][:3] if proba[i] > 0.02]
        if "battery_kwh" in locks:
            b_reasons, b_conf = [f"Fixed by the planner: {r.battery_kwh:g} kWh." if r.battery_kwh else "Fixed by the planner: no battery."], 1.0
        elif r.has_battery:
            b_conf = float(r.p_has_battery * proba[best])
            b_reasons = [f"{r.p_has_battery:.0%} of similar designs include a battery; {classes[best]:g} kWh is the most likely "
                         f"catalogue size ({proba[best]:.0%}), range {b_lo:g}-{b_hi:g} kWh.",
                         "Main drivers: " + "; ".join(self._drivers(self.battery_, Xb, f"{classes[best]:g} kWh", class_index=best)) + "."]
        else:
            b_conf = 1 - float(r.p_has_battery)
            b_reasons = [f"No battery: only {r.p_has_battery:.0%} of similar designs include one.",
                         "Main drivers: " + "; ".join(self._drivers(self.has_battery_, Xb, "a battery")) + "."]
        design["battery"] = dict(include=bool(r.has_battery), kwh=float(r.battery_kwh) if r.has_battery else None,
                                 range=[b_lo, b_hi], confidence=round(b_conf, 2), reasons=b_reasons,
                                 alternatives=alternatives)

        # wallbox
        wb_kw = self.catalogue_.get(installer, {}).get("wallbox_kw", 11.0)
        if "wallbox" in locks:
            wb_reasons, wb_conf = [f"Fixed by the planner: {'wallbox' if locks['wallbox'] else 'no wallbox'}."], 1.0
        else:
            wb_conf = float(max(r.p_has_wallbox, 1 - r.p_has_wallbox))
            wb_reasons = [f"{r.p_has_wallbox:.0%} of similar homes got a wallbox. " +
                          ("Driven by the electric car." if home.get("has_ev")
                           else "No EV recorded; many customers still order one, so ask them.")]
        design["wallbox"] = dict(include=bool(r.has_wallbox), kw=wb_kw if r.has_wallbox else None,
                                 confidence=round(wb_conf, 2), reasons=wb_reasons)

        facts.update(total_demand_kwh=float(X.total_demand_kwh.iloc[0]),
                     probabilities=dict(pv=round(float(r.p_has_pv), 2), battery=round(float(r.p_has_battery), 2),
                                        wallbox=round(float(r.p_has_wallbox), 2)),
                     date_used=_fmt("offer_month", X.offer_month.iloc[0]))
        return dict(design=design, facts=facts)

    def similar_homes(self, home: dict, installer: str, k: int = 5, heatpump_kw: float = 0.0) -> pd.DataFrame:
        """Closest past projects of the same installer: total demand (log) and EV status."""
        ref = self.reference_[self.reference_.installer == installer]
        if ref.empty:
            ref = self.reference_
        total = build_features(pd.DataFrame([home_to_row(home, installer)]), [heatpump_kw], self.installers_).total_demand_kwh.iloc[0]
        total = total if total and total > 0 else 4500.0
        dist = np.abs(np.log(ref.total_demand_kwh.clip(lower=1) / total)) + 0.3 * (ref.has_ev.astype(bool) != bool(home.get("has_ev")))
        out = ref.assign(similarity=(1 / (1 + 3 * dist)).round(2)).loc[dist.nsmallest(k).index]
        return out

    def validate(self, home: dict, installer: str, design: dict, k: int = 40) -> list[dict]:
        """Where does a planner's design sit among the k most similar past projects? + physics checks."""
        sim = self.similar_homes(home, installer, k=k, heatpump_kw=float(design.get("heatpump_kw") or 0))
        flags = []
        for comp, key, unit, mask in [("pv", "pv_kwp", "kWp", sim.has_pv.astype(bool)),
                                      ("battery", "battery_kwh", "kWh", sim.has_battery.astype(bool))]:
            v = design.get(key)
            vals = sim.loc[mask, key]
            if v is None or len(vals) < 5:
                continue
            v = float(v)
            if v == 0:
                flags.append(dict(component=comp, level="info", percentile=None, code=f"{comp.upper()}_NONE",
                                  message=f"No {comp}: {len(vals)} of {len(sim)} similar homes got one."))
                continue
            pct = int(round((vals < v).mean() * 100 + (vals == v).mean() * 50))
            if pct >= 90 or pct <= 10:
                word = "Larger" if pct >= 90 else "Smaller"
                share = pct if pct >= 90 else 100 - pct
                flags.append(dict(component=comp, level="warn", percentile=pct, code=f"{comp.upper()}_UNUSUAL",
                                  message=f"{word} than {share}% of similar homes ({vals.quantile(.1):.1f}-{vals.quantile(.9):.1f} {unit} is usual)."))
            else:
                flags.append(dict(component=comp, level="ok", percentile=pct, code=f"{comp.upper()}_TYPICAL",
                                  message=f"Typical for similar homes ({vals.quantile(.1):.1f}-{vals.quantile(.9):.1f} {unit})."))
        system = physics.System(pv_kwp=float(design.get("pv_kwp") or 0), battery_kwh=float(design.get("battery_kwh") or 0),
                                heatpump_kw=float(design.get("heatpump_kw") or 0), wallbox=bool(design.get("wallbox")))
        for f in physics.sanity_flags(home_to_physics(home), system):
            flags.append({**f, "percentile": None})
        return flags

    # ------------------------------------------------------------------ persistence
    def save(self, path: Path | str = MODEL_PATH):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._last = None
        joblib.dump(self, path)

    @staticmethod
    def load(path: Path | str = MODEL_PATH) -> "DesignModel":
        return joblib.load(path)


# ---------------------------------------------------------------------- conversions
def home_to_row(home: dict, installer: str) -> dict:
    """api.md `home` -> the input columns the features expect. offer_date None = today (capped)."""
    return dict(installer=installer, annual_kwh=home.get("annual_kwh"), price_eur_kwh=home.get("price_eur_kwh"),
                load_profile=home.get("load_profile") or "H0", has_ev=bool(home.get("has_ev")),
                ev_km_year=home.get("ev_km_year"), heating=home.get("heating"),
                heating_demand_kwh=home.get("heating_demand_kwh"),
                existing_pv=bool(home.get("existing_pv_kwp")), existing_battery=bool(home.get("existing_battery_kwh")),
                existing_wallbox=bool(home.get("existing_wallbox")), offer_date=home.get("offer_date"))


def home_to_physics(home: dict) -> physics.Home:
    return physics.Home(annual_kwh=home.get("annual_kwh"), load_profile=home.get("load_profile") or "H0",
                        has_ev=bool(home.get("has_ev")), ev_km_year=home.get("ev_km_year"), heating=home.get("heating"),
                        heating_demand_kwh=home.get("heating_demand_kwh"), existing_pv_kwp=home.get("existing_pv_kwp"),
                        price_eur_kwh=home.get("price_eur_kwh"), orientation_deg=home.get("orientation_deg"),
                        tilt_deg=home.get("tilt_deg"))


def _fmt(feature: str, value) -> str:
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return "unknown"
    if feature in ("total_demand_kwh", "annual_kwh", "heating_demand_kwh"):
        return f"{value:,.0f} kWh"
    if feature == "pv_kwp_planned":
        return f"{value:.1f} kWp"
    if feature == "price_eur_kwh":
        return f"{value:.2f} EUR/kWh"
    if feature == "ev_km":
        return f"{value:,.0f} km"
    if feature == "offer_month":
        return (pd.Timestamp("2024-01-01") + pd.DateOffset(months=int(value))).strftime("%b %Y")
    if feature == "daytime_presence":
        return {1: "often at home", -1: "away during the day"}.get(int(value), "average")
    return "yes" if value else "no"
