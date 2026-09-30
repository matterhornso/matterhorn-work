# Build-mode and rollback evidence

Application revision: `515c634319f71c0c698618f914744c00232da075`.
All builds use the isolated `run-check.mjs` runner with the existing pinned pnpm
and Bun. No dependencies were replaced. Existing >500KB chunk warnings remain.

| Stage / retro flag | Build | Artifact assertions | Log |
| --- | --- | --- | --- |
| `build 0` | Pass | No retro root marker/critical style; no static public auth shell | `/private/tmp/matterhorn-retro-qa-PK1pVu/build-0.log` |
| `build 1` | Pass | Retro root marker/critical style present; no static public auth shell | `/private/tmp/matterhorn-retro-qa-gi5lx5/build-1.log` |
| `build-web 0` | Pass | Incumbent first-paint beta label preserved; retro absent; static auth shell present | `/private/tmp/matterhorn-retro-qa-M4jxyS/build-web-0.log` |
| `build-web 1` | Pass | Retro marker/style and static auth shell present; beta disclosure below description | `/private/tmp/matterhorn-retro-qa-Xk1zbX/build-web-1.log` |

Assertions read the generated `apps/app/dist/index.html` after each build using
Node strict assertions. The last build leaves the public-web retro variant in
dist for the read-only preview. Builds run sequentially to avoid shared generated
SDK/UI output races.

`build` is the default frontend Vite build, **not an Electron/native installer**.
No code-signing, notarization, native launch or installed Safari acceptance is
claimed. `build-web` proves compilation/configuration of the web entry, not an
authenticated hosted session. Actual rollout still needs approved live acceptance.

The runner now rejects local `.env`, `.env.local`, production and test env files
in the repository/app directories by checking existence only; none are opened.
This supplements disposable HOME/XDG/process-environment isolation, since tools
may otherwise load project env files on their own. No such files were present
for this matrix. The runner does not delete or modify operator configuration.
