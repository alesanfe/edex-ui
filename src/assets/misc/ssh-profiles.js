// SSH profiles (EPIC-05): schema-v1 model + sanitization. Persisted to
// <settingsDir>/ssh-profiles.json as {version, profiles[]}.
// SECURITY MODEL: a profile carries ONLY connection metadata - no passwords,
// no key material. Authentication is delegated to the system ssh client
// (agent/keys/host verification run interactively in the spawned PTY), so
// secrets never enter the renderer or the profile store.
window.SshProfiles = (function () {
    const SCHEMA_VERSION = 1;
    const MAX_PROFILES = 100;
    const MAX_NAME = 80;
    const ENVS = ["local", "dev", "staging", "prod"];
    const RECONNECT = ["off", "auto"];
    const HOST_RE = /^[a-zA-Z0-9._-]+$/;
    const USER_RE = /^[a-zA-Z0-9._-]+$/;
    // remoteDir may only contain a conservative path charset - the value is
    // later composed into an ssh remote command, so anything else could
    // inject remote shell syntax.
    const REMOTE_DIR_RE = /^[~a-zA-Z0-9_\-./]+$/;
    const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
    // tmux session names are embedded in the remote command - strict charset.
    const TMUX_RE = /^[a-zA-Z0-9_.-]{1,40}$/;

    function sanitizeEnv(raw) {
        const out = {};
        if (raw && typeof raw === "object") {
            Object.keys(raw).slice(0, 20).forEach(k => {
                if (ENV_KEY_RE.test(k) && typeof raw[k] === "string" && raw[k].length <= 200) {
                    out[k] = raw[k];
                }
            });
        }
        return out;
    }

    // Returns a normalized profile or null when irreparably invalid.
    function sanitize(raw) {
        if (!raw || typeof raw !== "object") return null;
        const alias = typeof raw.alias === "string" ? raw.alias.trim() : "";
        const hostname = typeof raw.hostname === "string" ? raw.hostname.trim() : "";
        if (!alias || alias.length > MAX_NAME) return null;
        if (!hostname || hostname.length > 253 || !HOST_RE.test(hostname)) return null;
        const user = typeof raw.user === "string" && USER_RE.test(raw.user) ? raw.user : "";
        const port = Number(raw.port);
        const remoteDir = typeof raw.remoteDir === "string" && REMOTE_DIR_RE.test(raw.remoteDir)
            ? raw.remoteDir.slice(0, 300) : "";
        const color = /^#[0-9a-fA-F]{6}$/.test(raw.color || "") ? raw.color : "";
        return {
            id: typeof raw.id === "string" && raw.id.length <= 64 ? raw.id : nanoid(),
            alias,
            hostname,
            user,
            port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
            remoteDir,
            env: sanitizeEnv(raw.env),
            environment: ENVS.includes(raw.environment) ? raw.environment : "dev",
            color,
            uiMode: ["immersive", "productive", "light"].includes(raw.uiMode) ? raw.uiMode : null,
            reconnect: RECONNECT.includes(raw.reconnect) ? raw.reconnect : "off",
            tmuxSession: typeof raw.tmuxSession === "string" && TMUX_RE.test(raw.tmuxSession)
                ? raw.tmuxSession : "",
            lastUsedAt: typeof raw.lastUsedAt === "string" ? raw.lastUsedAt : null
        };
    }

    function parseStore(json) {
        const out = {version: SCHEMA_VERSION, profiles: []};
        if (!json || typeof json !== "object" || !Array.isArray(json.profiles)) {
            return out;
        }
        json.profiles.forEach(p => {
            const s = sanitize(p);
            if (s && out.profiles.length < MAX_PROFILES) out.profiles.push(s);
        });
        return out;
    }

    // Build the argument list handed to `ssh` in the main process. The
    // profile fields are already sanitized, but we still emit arguments as
    // an array (never a shell string), and the remote directory is composed
    // with strict single-quoting.
    function buildSshArgs(profile) {
        const args = ["-p", String(profile.port)];
        if (profile.user) args.push("-l", profile.user);
        let target = profile.hostname;
        // Remote command chain: cd (validated path) -> tmux attach-or-create
        // (validated session name, P3-4 persistent sessions) -> login shell.
        let remoteCmd = "";
        if (profile.remoteDir) {
            remoteCmd += "cd '" + profile.remoteDir.replace(/'/g, "") + "' && ";
        }
        if (typeof profile.tmuxSession === "string" && TMUX_RE.test(profile.tmuxSession)) {
            remoteCmd += "exec tmux new -A -s '" + profile.tmuxSession + "'";
        } else if (remoteCmd) {
            remoteCmd += "exec ${SHELL:-sh} -l";
        }
        if (remoteCmd) {
            args.push("-t", target, remoteCmd);
        } else {
            args.push(target);
        }
        return args;
    }

    return {SCHEMA_VERSION, MAX_PROFILES, parseStore, sanitize, buildSshArgs, ENVS};
})();
