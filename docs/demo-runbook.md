# Demo runbook (5 minutes, production)

`<APP_URL>` is the production web app. The URL itself lives in Vercel and `.status/`, never in git.
Every engine number below was checked on the live engine on 2026-11-08 at 00:20 and again at 02:50 after PRs #60 and #61 (installer A's catalogue, the voice default).
Numbers for the pitch: `docs/pitch-facts.md`.

## T−30 min: pre-flight
1. Open `<APP_URL>/api/engine/health`. It should report the engine reachable, the key configured, and one /design served by the engine.
   If not, go to "Engine down" below.
2. If `PLANNER_PASSCODE` is set, sign in at `<APP_URL>/login` in the demo browser and keep that tab open.
3. Open four tabs in this order: `/live`, `/` (planner), `/reality`, and an empty tab for the offer.
4. On `/reality`, check that the headline numbers show. "Engine offline" means the engine is down. Numbers to expect: new systems 2.50 vs 2.62 kWp; what-if card 2.94 → 2.19 kWp (say "what-if", never "accuracy": the answer is derived from the expert offer in this test).
5. Real voice call only: HQ's test call must have landed in the planner inbox on production. If it has not, use the scripted call.
6. Phone: charged, hotspot ready, the ElevenLabs test-call link from `docs/voice-agent.md` open, volume up.
7. Backup video: on the laptop desktop, already scrubbed to 0:00. v2 (4:58, local build of main + #89 + #103 with the engine's new /reality cases; scripted call with the EV, refine "Customer wants no battery", roof cap, /reality EV owner, send, Listen) is in `.status/backup/backup-v2.mp4`; v1 is the older take. Both show Reonic projects, so they are never committed. Re-take after the morning deploy if the screens change.

## The click path
| time | screen | do | expect on screen | say |
|---|---|---|---|---|
| 0:00–0:20 | slide | Opening line. | | "Planners rebuild the same system from scratch for every home. We let the installer's own past offers draft it, and the planner stays in charge." |
| 0:20–1:20 | `/live` | Start the voice call on the phone, held to the mic, and play the caller persona below. | "Incoming call" (replaced by the caller's name once given), then the fact checklist filling in, then "Draft design". At the end: "In the planner's inbox for review." | "An AI agent takes the site-visit call. It asks about existing solar first, because that is the strongest signal we found." |
| 1:20–1:35 | `/live` | Click **Open in planner**. | Planner page with "Drafted by AI from a call": the 3D house on top, the four system cards below. **9.9 kWp, 10 kWh battery, no wallbox**, and a heat pump chip **Option · 10.5 kW** (the installer's real size since engine #60). | "Every size comes from the engine, trained on this installer's signed offers. Claude never picks a size." |
| 1:35–2:00 | planner | Hover the Solar card: its part lights up on the house. Click the battery on the house: its card is ringed. Point at the range bar and the reasons. Optional: **Change** on the Solar card shows the engine's other plausible sizes. | P10–P90 range bar, 2 reasons ("N more reasons" opens the rest), similar homes as "96 % similar". In the Solar editor: **Also plausible: Larger 11.7 kWp · Smaller 7.65 kWp** (the share, 20 % and 10 %, is in the tooltip). | "Not a black box: a range, the reasons, and similar homes the installer already built." |
| 2:00–2:30 | planner | Click the example **They are buying an EV next year**, or type it, then **Update design**. | "Updating…" (about 4 s), then the changed cards stay highlighted with old → new: **Solar 9.9 → 11.25 kWp**, **Wallbox None → 11 kW**; battery stays 10 kWh. | "The planner talks to it like a colleague. PV, battery and wallbox are decided as one chain, so the EV pulls the PV up and adds the wallbox." |
| 2:30–2:45 (optional) | planner | Open **Roof size and direction** and set **Roof fits up to (kWp)** to 6. | **5.85 kWp, 7 kWh**, wallbox still on. | "Roof only fits 6 kWp? The battery follows the PV down." |
| 2:45–3:45 | `/reality` | On the planner, click **Compare with expert**, or switch to the pre-opened `/reality` tab. Click the example case **EV owner**, then scroll to the tiles below the houses. | **One past home**: two houses side by side, **Our design** and **What the expert sold**, with the verdict table. EV owner: ours **10.8 kWp / 9.7 kWh / 11 kW** vs the expert's **10.8 kWp / 9 kWh / Wallbox** (battery "One size step away"). Below the houses: **Level with rule 2.50 kWp vs 2.62**, **Better than rules 77 % vs 6 %**, **Calibrated 79 %**, and the expert's PV among our top 3 options for **67 %** of new systems. | "One past home: left, how our engine designs it; right, what the expert sold. The engine learned from this home too, so this is a picture of how it designs, not a test. The test is below: homes it never saw. On new systems it is on par with the best rule of thumb, 2.50 against 2.62 kWp, and its range holds the expert's choice for 79 % of them. On add-on sales it proposes no new solar for 77 % of homes, where rules of thumb manage 6 %." |
| 3:45–4:00 | planner | Back on the planner tab: **Use this design**, then **Send to homeowner**, then **Open** in the toast. | "Design saved as the offer", then "Homeowner link copied". The offer opens in the empty tab. | "One click and the homeowner gets a link." |
| 4:00–4:40 | `/offer/<token>` | Scroll the 3D house, then click **Listen to your offer**. | "Your energy system, explained", the house, savings, then the explanation (audio only if TTS is on). | "Plain words for the homeowner, and they can listen instead of read." |
| 4:40–5:00 | slide | Close. | | "One engine for the planner, the homeowner and the phone call: a reviewed draft in half a second, every size explained, 22 % less solar error than the best rule of thumb. Measured on 315 homes it never saw." |

### Caller persona for the real call (say these facts, in this order)
"Weber, in Augsburg." · "No, no solar and no battery yet." · "About 4,800 kilowatt hours, we're a family of four." ·
"**No electric car.**" · "Gas boiler, about 15 years old. Concrete tile roof, facing south." · confirm the summary.

The persona must say **no EV**, otherwise the EV step changes nothing.
Expected draft: 9.9 kWp + 10 kWh, no wallbox, 10.5 kW heat pump option (checked on production at 02:50; the heat pump size changed with engine #60 to the installer's real 10.5 kW). Re-check the draft once in pre-flight with the scripted call.

### Example cases on /reality, by role
The two houses show the **shipped engine**, which learned from all past projects including these. Never call them held-out or a test; the held-out numbers are the tiles below the houses (#98, "One past home").
Values below were read overnight on 2026-11-08 from a local build of main (+ #89, #103) against a local engine with #100 (GET /heldout); production shows them after Cala's `railway up`.

| button | ours (shipped engine, on screen) | expert | use on stage? |
|---|---|---|---|
| Typical home | 8.55 kWp, 9.2 kWh, no wallbox | 9.45 kWp; battery 5 or 10 kWh (2 options) | Yes: solar "Match", battery "Inside offered range". |
| EV owner | 10.8 kWp, 9.7 kWh, 11 kW wallbox | 10.8 kWp, 9 kWh, wallbox | **Yes: the hero case.** Solar and wallbox "Match", battery "One size step away". |
| Large home | 10.8 kWp, 10 kWh | 11.25 kWp, 10 kWh | Yes: both "Match". |
| Experts disagree | 9.0 kWp, 9.2 kWh | 6.75 · 12.15 kWp (2 options), 10 · 15 kWh | If asked: say "solar inside the offered range" (the battery shows "One size step away"); the expert offered two very different systems. |
| Heat pump case | no new PV, no battery, a wallbox, **12.5 kW heat pump offered as an option** | 12.5 kW heat pump only, no PV | Only if asked: the heat pump size is exactly the expert's; the engine adds a wallbox the expert did not sell. |
| Battery retrofit | "Not asked, as recorded": 9.9 kWp + 10 kWh, a new system. **"Planner answered (what-if)"**: no new PV + 5 kWh | 5 kWh battery-only add-on | Only as the what-if: switch to **Planner answered (what-if)** and say "if the planner answers 'solar already on the roof', it becomes the expert's battery add-on. That is why we ask it first." Never as accuracy. |

Live-engine checks you can repeat on the planner (production engine, 03:05). Base home: a new home in the planner with its defaults, 4,500 kWh, 0.32 €/kWh, H0 profile, gas heating, "Solar already on the roof?" = No.
The price and profile matter: the same 4,500 kWh sent without them gives 9.0 / 10.35 kWp, which is why older notes differ.
| change | design |
|---|---|
| none | 9.45 kWp, 9.2 kWh, no wallbox, heat pump option 10.5 kW |
| + electric car (15,000 km) | 10.8 kWp, 10 kWh, wallbox |
| + roof fits 6 kWp | 5.85 kWp, 7 kWh, wallbox |
| "Solar already on the roof?" = Yes, 8 kWp, instead of the above | battery retrofit, 5 kWh, no new PV |

## Hero moments: status and fallback per step
Updated as each pick merges. Until a row says **merged**, the click path above is what production shows.
The 3D house falls back by itself: with no Google 3D tiles (no key, slow or empty), the procedural house shows; when WebGL is missing or fails, the still image `web/public/models/house-fallback.png` shows. Two URL switches (since #78) work on any page with the house: add **`?static=1`** to show the still image without WebGL (use it when the projector stutters), or **`?tiles=0`** to force the procedural house when the real street misbehaves.

| screen | hero moment | status (night of 7–8 Nov) | if it misbehaves |
|---|---|---|---|
| `/live` | The house assembles while the call runs; "EV in spring" makes the car drive in. | PR #89 open (f-hero; on the overnight integration build the /live stage had zero height, reported); the voice side is **merged** (#73: `update_facts` writes each answer to the call live, once HQ attaches the tool to the agent) | Tiles slow or missing: the procedural house assembles instead, automatically. WebGL slow: the fact checklist and draft still fill in; talk over the checklist. |
| planner | The house stage on top, card ↔ house highlight, old → new on changed cards. | **merged** (#68) | Tiles: hidden today, the procedural house shows (no Google key on production). WebGL fails: the still image shows and the cards work as before. |
| planner | The real house from Google 3D tiles with panels on the real roof, the **Outside / Inside** and **Sun map** toggles. | **merged** (#78 real street behind `?tiles=1`, #83 sun map on the real roof); shows only with the Google key on production, which is frozen at #88 until the Vercel upgrade | No key, or tiles slow: no toggles, the procedural house shows; `?tiles=0` forces it. Do not mention the real roof then. |
| `/reality` | Two houses side by side: ours and the expert's. | **merged** (#72), checked locally 04:40 | Tiles slow or missing: procedural houses. WebGL slow: the numbers and the example cases still work; point at those. |
| `/offer` | **Listen** walks the house through one day. | voice side **merged** (#86: Listen drives the house's day in timed segments; #88 a cached demo clip); /offer A (#103, f-hero) open: works in the overnight integration build (Listen moves the clock 10:22 → 20:00) | No audio: the text shows the same words. WebGL slow: the still image shows, the explanation still plays. |

## Fallbacks
| problem | what you see | do | say |
|---|---|---|---|
| **Voice call fails** (no answer, nothing on /live within 20 s) | "Waiting for a call" | Click **Play demo call** on `/live`, then **End call and send draft**, then **Open in planner**. The script has an EV, so the draft is **11.25 kWp, 10 kWh, wallbox**. For the refine step, click **Customer wants no battery** instead of the EV example: the battery goes, PV and wallbox stay. | "Here is the same call, scripted, so we don't depend on the venue's phone signal." |
| **Engine down** | an **Offline estimate** badge on the planner and offer; "Engine offline" on `/reality` | Carry on: the planner still works on the built-in estimate and says so. Skip `/reality` and show deck charts 1 and 3 instead. | "When the engine is unreachable, the app falls back to a simple estimate and labels it. It never pretends." |
| **Wi-Fi down** | pages do not load | Switch to the phone hotspot, which takes about 30 s. If it is still down, play the backup video from the current step. | "Let me show you the recording while the network recovers." |
| **Audio missing** on the offer | text, no sound | Let the text show. It is the same explanation. | "The text version; audio plays the same words." |
| **Planner login appears** | the `/login` page | Type the passcode, which the presenter knows (it is not in this file). | |
| **Roof lookup empty** | no roof facts from the address | Expected: the Google Solar key is not set on production. Type the roof cap by hand, as in the optional step. | |

## Backup video: shot list (Mark records it after the 11:00 freeze, on production at 1080p, about 5 min)
Record the hero version once the rows above say merged; for a row that is not merged, record what production shows.
1. `/live`, idle, then the incoming call: the fact checklist fills in, the house assembles, and the car drives in at "EV in spring" (60 s). Use the real call if it works, else **Play demo call** (the scripted call has the EV).
2. **Open in planner**: the house on top, the cards below. Hover the Solar card (the roof lights up), click the battery on the house (its card is ringed), open "N more reasons" (25 s).
3. If the Google key is on production: **Sun map** toggle, then **Inside** (the diorama), then back to **Outside** (15 s).
4. Refine: **They are buying an EV next year**, then the changed cards: Solar 9.9 → 11.25 kWp, Wallbox None → 11 kW (30 s). With the scripted call use **Customer wants no battery** instead.
5. Roof cap 6 kWp, then 5.85 kWp + 7 kWh (15 s).
6. Set "Solar already on the roof?" to Yes, 8 kWp: a battery retrofit, 5 kWh, no new PV (15 s).
7. `/reality`: the headline tiles (2.50 vs 2.62 kWp, 79 % "Calibrated"), the two houses side by side, then **EV owner** and **Experts disagree** (60 s). Keep the what-if card out of the shot or say "what-if".
8. **Use this design**, then **Send to homeowner**, then **Open**: the offer page, scroll the house, click **Listen** and let the day play (60 s).
9. End card: the deck's headline chart (10 s).
