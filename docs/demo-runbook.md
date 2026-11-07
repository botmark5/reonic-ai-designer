# Demo runbook (5 minutes, production)

`<APP_URL>` is the production web app. The URL itself lives in Vercel and `.status/`, never in git.
Every engine number below was checked on the live engine on 2026-11-08 at 00:20 (installer A's catalogue, the voice default).
Numbers for the pitch: `docs/pitch-facts.md`.

## T−30 min: pre-flight
1. Open `<APP_URL>/api/engine/health`. It should report the engine reachable, the key configured, and one /design served by the engine.
   If not, go to "Engine down" below.
2. If `PLANNER_PASSCODE` is set, sign in at `<APP_URL>/login` in the demo browser and keep that tab open.
3. Open four tabs in this order: `/live`, `/` (planner), `/reality`, and an empty tab for the offer.
4. On `/reality`, check that the headline numbers show. "Engine offline" means the engine is down.
5. Real voice call only: HQ's test call must have landed in the planner inbox on production. If it has not, use the scripted call.
6. Phone: charged, hotspot ready, the ElevenLabs test-call link from `docs/voice-agent.md` open, volume up.
7. Backup video: on the laptop desktop, already scrubbed to 0:00.

## The click path
| time | screen | do | expect on screen | say |
|---|---|---|---|---|
| 0:00–0:20 | slide | Opening line. | | "Planners rebuild the same system from scratch for every home. We let the installer's own past offers draft it, and the planner stays in charge." |
| 0:20–1:20 | `/live` | Start the voice call on the phone, held to the mic, and play the caller persona below. | "Incoming call" (replaced by the caller's name once given), then the fact checklist filling in, then "Draft design". At the end: "In the planner's inbox for review." | "An AI agent takes the site-visit call. It asks about existing solar first, because that is the strongest signal we found." |
| 1:20–1:35 | `/live` | Click **Open in planner**. | Planner page with "Drafted by AI from a call". **9.9 kWp, 10 kWh battery, no wallbox.** A **10 kW heat pump** appears as a customer option. | "Every size comes from the engine, trained on this installer's signed offers. Claude never picks a size." |
| 1:35–2:00 | planner | Point at a card's range and its reasons, then at the 3D house. | P10–P90 range bar, reasons, similar homes. | "Not a black box: a range, the reasons, and similar homes the installer already built." |
| 2:00–2:30 | planner | Click the example **They are buying an EV next year**, or type it, then **Update design**. | "Updating…", then the **Changed** marker. **About 11 kWp, 10 kWh, wallbox on.** | "The planner talks to it like a colleague. PV, battery and wallbox are decided as one chain, so the EV pulls the PV up and adds the wallbox." |
| 2:30–2:45 (optional) | planner | Open **Roof size and direction** and set **Roof fits up to (kWp)** to 6. | **5.85 kWp, 7 kWh**, wallbox still on. | "Roof only fits 6 kWp? The battery follows the PV down." |
| 2:45–3:45 | `/reality` | On the planner, click **Compare with expert**, or switch to the pre-opened `/reality` tab. Read the headline, then click the example cases **EV owner** and **Experts disagree**. | Metrics from held-out homes. EV owner: ours **10.8 kWp / 9.7 kWh / wallbox** vs the expert's **10.8 / 9 / wallbox**. Experts disagree: ours **9.0 kWp**, inside the expert's two variants (6.75 and 12.15 kWp). | "Every number here comes from 315 homes the engine never saw. On new systems it is on par with the best rule of thumb, 2.50 against 2.62 kWp. On add-on sales it correctly proposes no new solar for 87 % of homes, where rules of thumb manage 6 %. Its range holds the expert's choice for 79–81 % of new systems, on target." |
| 3:45–4:00 | planner | Back on the planner tab: **Use this design**, then **Send to homeowner**, then **Open** in the toast. | "Design saved as the offer", then "Homeowner link copied". The offer opens in the empty tab. | "One click and the homeowner gets a link." |
| 4:00–4:40 | `/offer/<token>` | Scroll the 3D house, then click **Listen to your offer**. | "Your energy system, explained", the house, savings, then the explanation (audio only if TTS is on). | "Plain words for the homeowner, and they can listen instead of read." |
| 4:40–5:00 | slide | Close. | | "Same engine, one question answered, 25 % less PV error. Measured on 315 homes it never saw." |

### Caller persona for the real call (say these facts, in this order)
"Weber, in Augsburg." · "No, no solar and no battery yet." · "About 4,800 kilowatt hours, we're a family of four." ·
"**No electric car.**" · "Gas boiler, about 15 years old. Concrete tile roof, facing south." · confirm the summary.

The persona must say **no EV**, otherwise the EV step changes nothing.
Expected draft: 9.9 kWp + 10 kWh, no wallbox, 10 kW heat pump option. Checked with the same facts on the live engine.

### Example cases on /reality, by role
| button | ours (live engine) | expert | use on stage? |
|---|---|---|---|
| Typical home | 8.55 kWp, 9.2 kWh | 9.0 kWp, 10 kWh | Yes: within 1 kWp and one battery size. |
| EV owner | 10.8 kWp, 9.7 kWh, wallbox | 10.8 kWp, 9 kWh, wallbox | **Yes: the best match.** |
| Experts disagree | 9.0 kWp, 9.2 kWh | two variants: 6.75 and 12.15 kWp, 10 kWh | **Yes**: inside the expert's range. |
| Heat pump case | 11.7 kWp + 10 kWh, **12 kW heat pump offered as an option** | 12.5 kW heat pump only, no PV | Only if asked: the heat pump size is close, but the engine also proposes PV the expert did not sell. |
| Battery retrofit | 9.9 kWp + 10 kWh, a new system | 5 kWh battery-only add-on | **No.** This case is not yet given the existing-solar answer (issue #47). The page shows an amber **Unanswered mode** note on it, which disappears once #47 is fixed. If someone clicks it, point at the note and say: "This is the unanswered case. Answering 'solar already on the roof' turns it into a battery retrofit." |

Live-engine checks you can repeat on the planner. Base home: 4,500 kWh, "Solar already on the roof?" = No.
| change | design |
|---|---|
| none | 9.0 kWp, 9.2 kWh, no wallbox |
| + electric car (15,000 km) | 10.35 kWp, 10 kWh, wallbox |
| + roof fits 6 kWp | 5.85 kWp, 7 kWh, wallbox |
| "Solar already on the roof?" = Yes, 8 kWp, instead of the above | battery retrofit, 5 kWh, no new PV |

## Fallbacks
| problem | what you see | do | say |
|---|---|---|---|
| **Voice call fails** (no answer, nothing on /live within 20 s) | "Waiting for a call" | Click **Play demo call** on `/live`, then **End call and send draft**, then **Open in planner**. The script has an EV, so the draft is **11.25 kWp, 10 kWh, wallbox**. For the refine step, click **Customer wants no battery** instead of the EV example: the battery goes, PV and wallbox stay. | "Here is the same call, scripted, so we don't depend on the venue's phone signal." |
| **Engine down** | an **Offline estimate** badge on the planner and offer; "Engine offline" on `/reality` | Carry on: the planner still works on the built-in estimate and says so. Skip `/reality` and show deck charts 1 and 3 instead. | "When the engine is unreachable, the app falls back to a simple estimate and labels it. It never pretends." |
| **Wi-Fi down** | pages do not load | Switch to the phone hotspot, which takes about 30 s. If it is still down, play the backup video from the current step. | "Let me show you the recording while the network recovers." |
| **Audio missing** on the offer | text, no sound | Let the text show. It is the same explanation. | "The text version; audio plays the same words." |
| **Planner login appears** | the `/login` page | Type the passcode, which the presenter knows (it is not in this file). | |
| **Roof lookup empty** | no roof facts from the address | Expected: the Google Solar key is not set on production. Type the roof cap by hand, as in the optional step. | |

## Backup video: shot list (record on production at 1080p, about 5 min, voice-over optional)
1. `/live`, idle, then the incoming call. The fact checklist fills in and the draft appears (60 s). Use the real call if it works, else **Play demo call**.
2. Click **Open in planner**: the draft with ranges, reasons and the 3D house. Hover one reason (25 s).
3. Refine: **They are buying an EV next year**, then **Update design**, then the Changed marker with about 11 kWp and the wallbox (30 s).
4. Roof cap 6 kWp, then 5.85 kWp + 7 kWh (15 s).
5. Set "Solar already on the roof?" to Yes, 8 kWp: a battery retrofit, 5 kWh, no new PV (15 s).
6. `/reality`: the headline metrics, then **EV owner**, then **Experts disagree** (60 s).
7. **Use this design**, then **Send to homeowner**, then the offer page: scroll the 3D house and click **Listen to your offer** (60 s).
8. End card: the deck's headline chart (10 s).
