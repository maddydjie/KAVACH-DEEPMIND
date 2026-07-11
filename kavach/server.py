from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/web", StaticFiles(directory="web"), name="web")

@app.get("/")
async def root():
    with open("web/index.html") as f:
        return HTMLResponse(f.read())

@app.post("/trigger")
async def trigger(request: Request):
    data = await request.json()
    action = data.get("action")
    print(f"Trigger received: {action}")
    return {"status": "ok", "mode": data.get("mode", "online")}

async def event_generator():
    events = [
        {"stage": "Orchestrator", "agent": "Antigravity", "message": "Spawning Action and Comms agents in parallel.", "status": "active", "mode": "online"},
        {"stage": "Action", "agent": "Computer Use", "message": "Acquiring GPS lock. Opening Maps.", "status": "active", "mode": "online"},
        {"stage": "Comms", "agent": "Live Voice", "message": "Calling emergency contact (Teammate SOS)...", "status": "active", "mode": "online"},
        {"stage": "Action", "agent": "Computer Use", "message": "Routing to CVS 24/7 Pharmacy. ETA 4 mins.", "status": "active", "mode": "online"},
        {"stage": "Comms", "agent": "Live Voice", "message": "Contact answered. Patching in live microphone...", "status": "active", "mode": "online"}
    ]
    for ev in events:
        await asyncio.sleep(2)
        yield f"data: {json.dumps(ev)}\n\n"

@app.get("/session/1/events")
async def sse_events():
    return StreamingResponse(event_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    print("Starting Kavach local demo server on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
