document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const appBody = document.getElementById('appBody');
    const hubView = document.getElementById('hubView');
    const activeView = document.getElementById('activeView');
    const triggerBtn = document.getElementById('triggerBtn');
    const resolveBtn = document.getElementById('resolveBtn');
    const modeToggle = document.getElementById('modeToggle');
    const modeLabel = document.getElementById('modeLabel');
    const eventLog = document.getElementById('eventLog');
    const activeTitle = document.getElementById('activeTitle');
    const activeSubtitle = document.getElementById('activeSubtitle');
    const deadScreenHint = document.getElementById('deadScreenHint');

    // State
    let isOffline = false;
    let isDefenseActive = false;
    let sseSource = null;
    let audioContext = null;
    let oscillator = null;

    // Initialization
    modeToggle.addEventListener('change', (e) => {
        setOfflineMode(e.target.checked);
    });

    triggerBtn.addEventListener('click', triggerCodeRed);
    resolveBtn.addEventListener('click', resolveIncident);
    
    // Double tap dead screen to restore
    let lastTap = 0;
    appBody.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (isOffline && isDefenseActive && tapLength < 500 && tapLength > 0) {
            // Double tap - toggle back to online
            modeToggle.checked = false;
            setOfflineMode(false);
            e.preventDefault();
        }
        lastTap = currentTime;
    });
    
    // Double click for mouse users
    appBody.addEventListener('dblclick', () => {
        if (isOffline && isDefenseActive) {
            modeToggle.checked = false;
            setOfflineMode(false);
        }
    });

    // Triple tap body to trigger Code Red
    let tapCount = 0;
    let tapTimer = null;
    appBody.addEventListener('click', (e) => {
        // Ignore clicks on buttons or inputs
        if (e.target.closest('button') || e.target.closest('input') || e.target.closest('label')) {
            return;
        }

        if (!isDefenseActive) {
            tapCount++;
            if (tapCount >= 3) {
                tapCount = 0;
                clearTimeout(tapTimer);
                triggerCodeRed();
            } else {
                clearTimeout(tapTimer);
                tapTimer = setTimeout(() => {
                    tapCount = 0;
                }, 1000);
            }
        }
    });

    // Physical side buttons (Volume Keys) to trigger Code Red
    let volumeTapCount = 0;
    let volumeTapTimer = null;
    
    document.addEventListener('keydown', (e) => {
        // Checking for common Volume key codes or key strings
        if (e.key === 'VolumeUp' || e.key === 'VolumeDown' || 
            e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' || 
            e.keyCode === 227 || e.keyCode === 228 || e.keyCode === 175 || e.keyCode === 174) {
            
            if (!isDefenseActive) {
                volumeTapCount++;
                if (volumeTapCount >= 3) {
                    volumeTapCount = 0;
                    clearTimeout(volumeTapTimer);
                    triggerCodeRed();
                } else {
                    clearTimeout(volumeTapTimer);
                    volumeTapTimer = setTimeout(() => {
                        volumeTapCount = 0;
                    }, 1500);
                }
            }
        }
    });

    function setOfflineMode(offline) {
        isOffline = offline;
        modeLabel.textContent = isOffline ? "DARK SURVIVAL (OFF)" : "GHOST OPERATOR (ON)";
        modeLabel.className = `text-xs font-bold tracking-wider ${isOffline ? 'text-cyberOrange' : 'text-safetyGreen'}`;

        if (isDefenseActive) {
            if (isOffline) {
                activateDarkSurvival();
            } else {
                activateGhostOperator();
            }
        }
        
        // Notify backend of mode change
        fetch('/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "mode_switch", mode: isOffline ? "offline" : "online" })
        }).catch(() => console.log("Backend offline, mode switched locally."));
    }

    async function triggerCodeRed() {
        isDefenseActive = true;
        hubView.classList.add('hidden');
        activeView.classList.remove('hidden');
        activeView.classList.add('flex');
        
        eventLog.innerHTML = '';
        logEvent('System', 'Code Red Triggered.', isOffline ? 'cyberOrange' : 'crimsonRed');

        if (isOffline) {
            activateDarkSurvival();
        } else {
            activateGhostOperator();
        }

        try {
            await fetch('/trigger', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: "code_red", source: "button" })
            });
            startSSE();
        } catch (e) {
            console.log("Backend offline, running local mock.");
            runMockSequence();
        }
    }

    function resolveIncident() {
        isDefenseActive = false;
        activeView.classList.add('hidden');
        activeView.classList.remove('flex');
        hubView.classList.remove('hidden');
        
        stopSiren();
        if (sseSource) {
            sseSource.close();
            sseSource = null;
        }
        appBody.classList.remove('dead-screen');
        deadScreenHint.classList.add('hidden');
        
        fetch('/trigger', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "resolve" })
        }).catch(() => {});
    }

    function activateDarkSurvival() {
        activeTitle.textContent = "DARK SURVIVAL ENGAGED";
        activeSubtitle.textContent = "ON-DEVICE GEMMA 4 ACTIVE";
        
        appBody.classList.add('dead-screen');
        deadScreenHint.classList.remove('hidden');
        
        logEvent('Gemma', 'SOS Beacon QUEUED. Will transmit when signal returns.', 'cyberOrange', 'hourglass_top');
        startSiren();
    }

    function activateGhostOperator() {
        activeTitle.textContent = "GHOST OPERATOR ENGAGED";
        activeSubtitle.textContent = "AUTONOMOUS ORCHESTRATION";
        
        appBody.classList.remove('dead-screen');
        deadScreenHint.classList.add('hidden');
        
        stopSiren();
    }

    function startSiren() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (oscillator) return;
        
        oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // 800Hz
        
        // Modulate frequency to create siren effect
        setInterval(() => {
            if (oscillator && oscillator.frequency) {
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.linearRampToValueAtTime(1200, audioContext.currentTime + 0.4);
            }
        }, 800);

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Keep volume reasonable
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
    }

    function stopSiren() {
        if (oscillator) {
            oscillator.stop();
            oscillator.disconnect();
            oscillator = null;
        }
    }

    function logEvent(agent, message, colorClass = 'iceWhite', icon = 'shield') {
        const div = document.createElement('div');
        div.className = `flex items-start gap-3 bg-[#1A1F29] p-3 rounded-lg border border-borderGray`;
        
        const iconColor = colorClass === 'crimsonRed' ? 'text-crimsonRed' : 
                         colorClass === 'cyberOrange' ? 'text-cyberOrange' : 
                         colorClass === 'safetyGreen' ? 'text-safetyGreen' : 'text-iceWhite';

        div.innerHTML = `
            <span class="material-icons ${iconColor} text-sm mt-0.5">${icon}</span>
            <div>
                <span class="text-[10px] font-bold text-mutedSlate uppercase">${agent}</span>
                <p class="text-xs text-${colorClass} mt-1">${message}</p>
            </div>
        `;
        eventLog.appendChild(div);
        eventLog.scrollTop = eventLog.scrollHeight;
    }

    function startSSE() {
        if (sseSource) sseSource.close();
        sseSource = new EventSource('/session/1/events');
        sseSource.onmessage = (e) => {
            const data = JSON.parse(e.data);
            let color = 'iceWhite';
            let icon = 'info';
            
            if (data.agent === 'Antigravity') icon = 'hub';
            if (data.agent === 'Computer Use') icon = 'explore';
            if (data.agent === 'Live Voice') { icon = 'phone_in_talk'; color = 'safetyGreen'; }
            if (data.status === 'failed') color = 'crimsonRed';

            logEvent(data.agent, data.message, color, icon);
        };
    }

    // Mock Sequence for purely local demo
    function runMockSequence() {
        const events = [
            { agent: "Antigravity", message: "Spawning Action and Comms agents in parallel.", icon: "hub", color: "iceWhite", delay: 1000 },
            { agent: "Computer Use", message: "Acquiring GPS lock. Opening Maps.", icon: "explore", color: "iceWhite", delay: 2500 },
            { agent: "Live Voice", message: "Calling emergency contact (Teammate SOS)...", icon: "phone_in_talk", color: "safetyGreen", delay: 4000 },
            { agent: "Computer Use", message: "Routing to CVS 24/7 Pharmacy. ETA 4 mins.", icon: "directions_run", color: "iceWhite", delay: 5500 },
            { agent: "Live Voice", message: "Contact answered. Patching in live microphone...", icon: "record_voice_over", color: "safetyGreen", delay: 8000 }
        ];

        let elapsed = 0;
        events.forEach(ev => {
            setTimeout(() => {
                if (isDefenseActive && !isOffline) {
                    logEvent(ev.agent, ev.message, ev.color, ev.icon);
                }
            }, ev.delay);
        });
    }
});
