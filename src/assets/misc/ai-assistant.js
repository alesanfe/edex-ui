// AI assistant (P3-1): strictly opt-in, local-first. Per
// docs/design/AI-INTEGRATION.md - no scrollback exfiltration (only the
// user's explicit selection/prompt is sent), no telemetry, redaction of
// common secret patterns before anything leaves the renderer.
window.Ai = (function () {
    // Order matters: specific token formats run before the generic
    // key:value pattern, which would otherwise eat the "Bearer"/scheme word
    // and leave the credential itself behind.
    const SECRET_RES = [
        /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
        /AKIA[0-9A-Z]{16}/g,                                   // AWS access key
        /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,   // JWT
        /xox[baprs]-[a-zA-Z0-9-]+/g,                            // Slack
        /gh[psou]_[a-zA-Z0-9]{20,}/g,                           // GitHub tokens
        /bearer\s+[a-zA-Z0-9._\-]+/gi,
        /(?:api[_-]?key|token|secret|passwd|password|authorization)\s*[:=]\s*["']?\S+["']?/gi
    ];

    function redactSecrets(text) {
        return SECRET_RES.reduce((t, re) => t.replace(re, "[REDACTED]"), String(text || ""));
    }

    function enabled() {
        return !!(window.settings && window.settings.aiEnabled);
    }

    function ask(prompt) {
        return window.edex.ai.chat({
            endpoint: (window.settings.aiEndpoint || "http://localhost:11434").slice(0, 200),
            model: (window.settings.aiModel || "llama3").slice(0, 80),
            prompt: redactSecrets(prompt)
        });
    }

    function esc(s) {
        return String(s).replace(/[&<>]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[c]));
    }

    window.openAiAssistant = () => {
        if (!enabled()) {
            const consent = new Modal({
                type: "custom",
                title: "AI assistant",
                html: `<div><p>The AI assistant is <b>opt-in</b>. It sends ONLY the prompt you type
                    (and optionally the current terminal selection) to the endpoint configured in
                    settings (default: local Ollama at <code>http://localhost:11434</code>).</p>
                    <p>No scrollback, keystrokes or files are ever sent automatically.
                    Common secret patterns are redacted before sending.</p></div>`,
                buttons: [
                    {label: "ENABLE & OPEN", action: () => {
                        window.settings.aiEnabled = true;
                        consent.close();
                        window.openAiAssistant();
                    }},
                    {label: "CANCEL", action: () => consent.close()}
                ]
            });
            return;
        }
        const sel = (window.term && window.term[window.currentTerm] && window.term[window.currentTerm].term)
            ? window.term[window.currentTerm].term.getSelection() : "";
        const m = new Modal({
            type: "custom",
            title: "AI assistant",
            html: `<div id="ai_panel">
                ${sel ? `<h5>Context: current selection (${sel.length} chars, secrets will be redacted)</h5>` : ""}
                <textarea id="ai_prompt" rows="5" style="width:100%" placeholder="Ask the local model..."></textarea>
                <div id="ai_answer" style="white-space:pre-wrap;margin-top:1vh;max-height:40vh;overflow:auto;"></div>
            </div>`,
            buttons: [{label: "ASK", action: () => {
                const q = document.getElementById("ai_prompt").value;
                const ctx = document.getElementById("ai_answer");
                if (!q.trim()) return;
                ctx.innerText = "…";
                ask((sel ? "Terminal selection:\n" + sel + "\n\n" : "") + q)
                    .then(r => { ctx.innerText = String(r && r.response || "(empty response)"); })
                    .catch(e => { ctx.innerText = "Error: " + esc(e && e.message || e); });
            }}]
        });
    };

    return {ask, redactSecrets, enabled};
})();

if (typeof module !== "undefined") {
    module.exports = window.Ai;
}
