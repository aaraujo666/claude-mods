# claude-mods

Claude Code mods (plugins built from a function-hooks module) that change the desktop app's and
the terminal's interface. This folder is a local plugin **marketplace** named `anthony-mods`.
Each mod is a subfolder.

| Mod | What it does |
|---|---|
| `session-gauges` | Shows a band above the prompt with a context-window fill bar (`42% 84k / 200k`, green, then yellow at 60%, then red at 80%). It also shows a count of background tasks still running. Click the count to open the desktop app's tasks pane. |

## Install (once per machine)

Use the desktop app's bundled engine. The npm `claude` on PATH (2.1.198) is too old for mods.

```powershell
$c = (Get-ChildItem "$env:APPDATA\Claude\claude-code\*\*\claude.exe" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
& $c plugin marketplace add C:\Users\antho\source\tools\claude-mods
& $c plugin install session-gauges@anthony-mods --scope user
```

The marketplace is a folder, so the installed plugin runs **from this folder**, not from a copy.
After you edit a mod, run `/reload-plugins` in a terminal session or start a new session. You don't
need to reinstall or bump the version.

## Check a mod

```powershell
& $c plugin validate C:\Users\antho\source\tools\claude-mods\session-gauges
& $c plugin test     C:\Users\antho\source\tools\claude-mods\session-gauges
```

## Traps

- A hook's arguments are `($, e, next)`. The first one is the engine, not the event.
- Don't declare a local variable called `next` inside a hook. Validation refuses the shadowing.
- The mod API is marked early access. After a Claude Code update, re-run validate and test. A
  broken hook is skipped with one dim line in the transcript, and the app carries on.
