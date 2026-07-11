"""Comms Agent — external crisis communication.

Sends a real SMS and places a real voice call to the user's emergency contacts
via Twilio. If Twilio is not configured (or the trial rejects the number) it
degrades gracefully to a *simulated* dispatch so the demo never hard-fails.

Twilio trial accounts can only message/call VERIFIED numbers — verify each
emergency contact in the Twilio console first.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional

from .. import config
from ..events import AgentName, AgentState, EventBus


@dataclass
class CommsResult:
    sms_sent: list[str]
    calls_placed: list[str]
    simulated: bool
    message: str


def _crisis_sms(location_text: str, maps_url: Optional[str]) -> str:
    body = (
        f"KAVACH SILENT ALARM: {config.USER_NAME} triggered a distress signal. "
        f"Location: {location_text}."
    )
    if maps_url:
        body += f" Map: {maps_url}"
    body += " A cab has been dispatched. Please respond immediately."
    return body


def _crisis_twiml(location_text: str) -> str:
    """Calm synthesized voice read to the emergency contact on pickup."""
    return (
        "<Response><Say voice=\"Polly.Aditi\">"
        f"Hello. This is Kavach. {config.USER_NAME} has triggered a silent alarm "
        f"near {location_text}. A cab has been dispatched to their location. "
        "Please stay on the line; you will be patched into their live audio."
        "</Say><Pause length=\"2\"/></Response>"
    )


async def run_comms_agent(
    bus: EventBus,
    location_text: str,
    maps_url: Optional[str] = None,
) -> CommsResult:
    await bus.agent(
        AgentName.COMMS, AgentState.SPAWNED, "Comms Agent spawned",
        "Preparing to alert emergency contacts",
    )

    contacts = config.EMERGENCY_CONTACTS
    if not contacts:
        await bus.agent(
            AgentName.COMMS, AgentState.RUNNING, "No contacts configured",
            "Set EMERGENCY_CONTACTS in .env — simulating dispatch",
        )

    # Fallback path: no Twilio creds OR no contacts -> simulate.
    if not config.TWILIO_ENABLED or not contacts:
        return await _simulate(bus, contacts, location_text, maps_url)

    try:
        return await asyncio.to_thread(
            _twilio_dispatch, bus, contacts, location_text, maps_url
        )
    except Exception as exc:  # noqa: BLE001 — demo must survive any telephony error
        await bus.agent(
            AgentName.COMMS, AgentState.RUNNING, "Twilio failed — falling back",
            f"{type(exc).__name__}: {exc}",
        )
        return await _simulate(bus, contacts, location_text, maps_url)


def _twilio_dispatch(
    bus: EventBus,
    contacts: list[str],
    location_text: str,
    maps_url: Optional[str],
) -> CommsResult:
    """Blocking Twilio calls; run inside a thread. Emits via the running loop."""
    from twilio.rest import Client

    loop = asyncio.get_event_loop_policy().get_event_loop()

    def emit(state: AgentState, title: str, detail: str = "", **data):
        fut = asyncio.run_coroutine_threadsafe(
            bus.agent(AgentName.COMMS, state, title, detail, **data), loop
        )
        fut.result()

    client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
    body = _crisis_sms(location_text, maps_url)
    twiml = _crisis_twiml(location_text)

    sms_sent, calls_placed = [], []
    for number in contacts:
        emit(AgentState.RUNNING, "Sending SMS", f"→ {number}")
        msg = client.messages.create(
            body=body, from_=config.TWILIO_FROM_NUMBER, to=number
        )
        sms_sent.append(number)
        emit(AgentState.RUNNING, "SMS sent", f"{number} (sid {msg.sid[:10]}…)")

        emit(AgentState.RUNNING, "Placing crisis call", f"→ {number}")
        call = client.calls.create(
            twiml=twiml, from_=config.TWILIO_FROM_NUMBER, to=number
        )
        calls_placed.append(number)
        emit(AgentState.RUNNING, "Call ringing", f"{number} (sid {call.sid[:10]}…)")

    emit(
        AgentState.DONE, "Emergency contacts alerted",
        f"{len(sms_sent)} SMS · {len(calls_placed)} calls (LIVE via Twilio)",
    )
    return CommsResult(sms_sent, calls_placed, simulated=False,
                       message="Live Twilio dispatch complete")


async def _simulate(
    bus: EventBus,
    contacts: list[str],
    location_text: str,
    maps_url: Optional[str],
) -> CommsResult:
    body = _crisis_sms(location_text, maps_url)
    targets = contacts or ["+91-DEMO-CONTACT"]
    for number in targets:
        await bus.agent(
            AgentName.COMMS, AgentState.RUNNING, "SMS (simulated)",
            f"→ {number}: {body[:60]}…",
        )
        await asyncio.sleep(0.3)
        await bus.agent(
            AgentName.COMMS, AgentState.RUNNING, "Voice call (simulated)",
            f"Calm AI voice → {number}",
        )
        await asyncio.sleep(0.3)
    await bus.agent(
        AgentName.COMMS, AgentState.DONE, "Emergency contacts alerted",
        f"{len(targets)} contact(s) — SIMULATED (configure Twilio for live)",
    )
    return CommsResult(list(targets), list(targets), simulated=True,
                       message="Simulated dispatch (Twilio not active)")
