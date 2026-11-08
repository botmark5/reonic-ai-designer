# How to use the website (planner, live call, reality check, homeowner)

`<APP_URL>` is the production web app on Vercel (the URL and the planner passcode are given separately, never in git).
Everything below was read from the screens' own labels on 8 Nov 2026. Judges: start with **Quick tour**.

## Quick tour (3 minutes, no phone needed)
1. Open `<APP_URL>`. On **Planner sign-in**, type the passcode and press **Sign in**.
2. Go to **Live call** (top navigation). Press **Play demo call**. The scripted call fills the fact checklist and shows
   **Draft design**. Press **End call and send draft**, then **Open in planner**.
3. On the planner, you see the 3D house on top and four cards below: **Solar**, **Battery**, **Wallbox**, **Heat pump**.
   Each card shows the size, a range bar, two reasons ("N more reasons" opens the rest) and a status badge.
4. Under **Refine the design**, click the example **They are buying an EV next year** (or type your own sentence) and
   press **Update design**. The changed cards are highlighted with old → new values.
5. Press **Compare with expert**. The **Reality check** page opens: example past homes next to the real expert design,
   and the held-out numbers below.
6. Back on the planner: **Use this design**, then **Send to homeowner**, then **Open** in the toast. The homeowner page
   opens: the house, the system in plain words, **Listen to your offer**.

## 1. Sign in
- `/login`: the planner passcode protects every planner page and API. Only the homeowner link (`/offer/<token>`) and the
  voice endpoints are public.
- If the **Planner sign-in** page appears in the middle of a demo, type the passcode again; nothing is lost.

## 2. Planner (`/`)
**Left column, Inbox.** Every design in the inbox: drafts from calls are marked **From call ·** and **Drafted by AI**.
**New home** starts an empty home (optional name: "Customer, town").

**Left column, Home.** The inputs the engine uses:
- **Solar already on the roof?** No / Yes (+ **Existing solar (kWp, optional)**). This is the engine's strongest input:
  "Yes" turns the design into a battery add-on, "No" into a new system. The badge **Not asked yet** means the engine is guessing.
- **Annual consumption (kWh)**: the yearly household electricity. Leaving the tool's default means "not entered"; type the real
  value when you know it.
- **Electricity price (€/kWh)**, **Household** (load profile), **Heating** (gas, oil, heat pump, …) and **Heating demand
  (kWh / year)**: the heat demand sizes the heat pump option.
- **Electric car** Yes / No and **Car: km per year**: an EV adds a wallbox and pulls the solar size up.
- **Roof**: **Roof fits up to (kWp)** caps the solar size at what the roof holds; **Faces (° from north)** (180 = south) and
  **Pitch (°)** change yield and autarky, not the size. With a Google key the app fills these from the address.
- Inputs are paused while the designer updates the design (a second or two).

**Centre, the house and the four cards.**
- Hover a card: its part lights up on the house. Click a part on the house: its card is ringed.
- **Badges**: *High confidence / Likely / Low confidence* (model confidence), *Typical* or *Unusual* (where the size sits
  among the 40 most similar past homes of this installer), *Check* / *Implausible* (physics), *Set by planner* (locked),
  *Customer option* (the heat pump, offered but not included), *Changed* (after a refine).
- **Lock**: fixes the card's value; the rest of the chain re-plans around it (lock "none" on Solar to design a battery
  add-on, lock the battery at 0 for "no battery"). **Locked** → click again to unlock.
- **Change** (Solar, Battery): opens the editor. **One panel more / less** steps the solar in 450 W panels; **Also plausible**
  shows one smaller and one larger size the installer sells, with how often the model expects each; a click sets it.
- **Heat pump** card: for gas and oil homes a size is offered as **Option · x kW**; the button adds it (the design
  with and without it is compared in the evidence panel). Never added by default.
- **Checks** on a card: the plain-language validation ("Larger than 99 % of similar homes", "PV produces 4.3× the home's
  consumption …"). A planner override is validated the same way ("Set by planner · Unusual").

**Right column, Evidence.** *Why this design* (the reasons), *Physics check* (yield, self-consumption, autarky, the
assumptions used), *Similar homes* (the five closest past projects of this installer with what they got), economics
(placeholder prices; savings and payback are illustrations).

**Refine the design.** Type what changed in plain words ("they're buying an EV next year", "no battery", "as
independent as possible", "add the heat pump") or click an example, then **Update design**. Claude turns the sentence
into input changes and locks; the engine computes every size. An optional **Why?** note is saved with each change.

**Buttons at the top.** **Compare with expert** opens the reality check. **Use this design** marks the design as the offer
("Design saved as the offer"); **Send to homeowner** creates the share link ("Homeowner link copied", **Open** opens it).

**Offline estimate badge.** If the engine is unreachable the app shows a labelled built-in estimate instead of failing.

## 3. Live call (`/live`)
- **Waiting for a call**: the screen polls for an incoming call to the ElevenLabs agent (phone or the browser test link in
  `docs/voice-agent.md`). During a real call the caller's name replaces **Incoming call**, the checklist **What the agent has
  so far** fills in, the house assembles, and **Draft design** appears; at the end the card reads "In the planner's inbox".
- No phone signal: **Play demo call** plays the scripted call (it includes an EV), then **End call and send draft**, then
  **Open in planner**. **Restart** plays it again.
- The agent asks about existing solar first, never invents a value, and reads a summary back before it hangs up.

## 4. Reality check (`/reality`)
- **One past home**: two houses side by side, **Our design** and **What the expert sold**, with a per-component verdict
  (Match, Inside offered range, One size step away, Different from the expert, Expert offered none / one, Offered as
  customer option). The example chips (**Typical home**, **EV owner**, **Experts disagree**, **Battery retrofit**, …),
  **Random home**, **Previous**, and **Open a past project by ID**.
- **“Solar already on the roof?” · Not asked, as recorded | Planner answered (what-if)**: shows the same home with the
  planner's answer. Say "what-if", never "accuracy": in the evaluation that answer is derived from the expert offer.
- Below: the held-out numbers (315 homes the engine never saw) with **Better than rules / Level with rule / Below
  simple rule** badges, **Expert solar inside our P10–P90 range** (target 80 %), **Expert solar among our top 3 options**,
  **Solar size error by yearly consumption**, **Learned on one installer, tested on the other**, **Where we differ from
  the experts**, and the what-if card. **Method** explains the protocol.
- "Engine offline: no numbers are shown until it is reachable again" means the engine is down; nothing is invented.

## 5. Homeowner offer (`/offer/<token>`)
- Public link, no sign-in. **Your offer**: the house through a sunny day (drag the time under the house), **Your system**,
  **What it means for you** (power you make yourself, savings per year; "Prices and savings are estimates. Your installer
  confirms the final price.").
- **Listen to your offer**: a spoken explanation (ElevenLabs); the house follows the voice through the day.
  **Read the whole explanation** shows the text.
- Variants within what the installer allows: **Battery size**, **Heat pump**, **Car charger**. Each choice says what it
  changes in euros and in the share of power made at home. The home's facts stay fixed.

## 6. For developers and judges
- `GET <APP_URL>/api/engine/health` shows whether the live engine is reachable and one design served by it.
- Engine endpoints (`X-Engine-Key` header): `POST /design`, `/validate`, `/refine`, `/explain`, `GET /eval`,
  `/project/{id}[?answered=true]`, `/heldout`, `/installers`, `/health`. Contract: `docs/api.md`.
- Local run without any keys: `cd web && npm ci && npm run dev` (offline estimate + in-memory inbox); engine setup and
  reproduction of the numbers: `engine/README.md`.
- URL switches on any page with the house: `?static=1` shows the still image instead of WebGL; `?tiles=0` / `?tiles=1`
  forces the procedural house or the real street (needs the Google key).
