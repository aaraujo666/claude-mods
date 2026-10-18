# claude-mods

Claude Code mods (plugins built from a function-hooks module) that change the desktop app's and
the terminal's interface. This folder is a local plugin **marketplace** named `anthony-mods`.
Each mod is a subfolder.

| Mod | What it does |
|---|---|
| `session-gauges` | Shows a band above the prompt with a context-window fill bar (`42% 84k / 200k`, green, then yellow at 60%, then red at 80%). It also shows a count of background tasks still running. Click the count to open the desktop app's tasks pane. |

## Install

The mods are published at https://github.com/aaraujo666/claude-mods. Install one from the prompt
of a Claude Code terminal session:

```
/plugin install session-gauges --marketplace aaraujo666/claude-mods
```

From a shell, run `claude plugin install session-gauges --marketplace aaraujo666/claude-mods`.

In the Claude desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then
**Plugins**, then **Add marketplace** with `aaraujo666/claude-mods`, then **Add plugin**.

Mods need a recent Claude Code with function-hooks support. These were built and tested on 2.1.299.

### Working copy (the author's machine)

To work on a mod, install it from a local clone instead. A folder marketplace runs the plugin from
that folder, not from a copy. After an edit, run `/reload-plugins` or start a new session. You
don't need to reinstall.

```powershell
$c = (Get-ChildItem "$env:APPDATA\Claude\claude-code\*\*\claude.exe" | Sort-Object LastWriteTime | Select-Object -Last 1).FullName
& $c plugin marketplace add <path-to-clone>
& $c plugin install session-gauges@anthony-mods --scope user
```

Use the desktop app's bundled engine. An older npm `claude` on PATH may be too old for mods.

## Check a mod

```powershell
& $c plugin validate .\session-gauges
& $c plugin test     .\session-gauges
```

## Traps

- A hook's arguments are `($, e, next)`. The first one is the engine, not the event.
- Don't declare a local variable called `next` inside a hook. Validation refuses the shadowing.
- The mod API is marked early access. After a Claude Code update, re-run validate and test. A
  broken hook is skipped with one dim line in the transcript, and the app carries on.
