# Voice agent (ElevenLabs)

- Agent: "Reonic AI Designer - Site Visit Agent", id `agent_5001m6vfnmapfkxvxv4af19jj87w` (Mark's ElevenLabs workspace)
- Editor: https://elevenlabs.io/app/agents/agents/agent_5001m6vfnmapfkxvxv4af19jj87w
- Test call (browser/phone): https://elevenlabs.io/app/talk-to?agent_id=agent_5001m6vfnmapfkxvxv4af19jj87w
- Language: English (German preset can be added later). Voice: default for now; planned "Dylan" (KxR7w7QY9Rc4gig86VPG)
  once added to the workspace from the Voice Library.
- Behaviour: collects 8 fact groups, never invents values, reads a summary back, confirms, says the draft will be in the inbox.

## Data collection (post-call analysis fields)
customer_name, address, annual_kwh, monthly_bill_eur, household, daytime_presence, has_ev, ev_km_year,
heating [gas|oil|heatpump|electric|district|wood|other|unknown], heating_age_years,
roof_type [concrete_tile|clay_tile|flat|metal|slate|other|unknown],
roof_direction [south|south_east|south_west|east_west|east|west|north|unknown],
existing_pv_kwp, existing_battery_kwh, wishes, facts_confirmed.
Evaluation criterion: facts_complete.

## Still to connect (session D builds the endpoints, then Claude in chat attaches them to the agent)
1. Server tool `create_design` → POST {PUBLIC_URL}/api/voice/create-design with header `x-agent-token: {ELEVENLABS_TOOL_SECRET}`,
   params = the fields above (description: "never assume values; only send what the caller said"), response
   `{ instruction: "Tell the caller: …" }`. Then the prompt's closing step changes to "call create_design, then read its instruction".
2. Post-call webhook (workspace settings) → POST {PUBLIC_URL}/api/voice/post-call, HMAC secret = ELEVENLABS_WEBHOOK_SECRET.
3. PUBLIC_URL = the Vercel deployment (or a cloudflared tunnel while developing).
See docs/rosi-notes.md for the pitfalls (raw-body HMAC, null → '', defaults for dynamic variables).
