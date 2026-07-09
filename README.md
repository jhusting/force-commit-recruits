# Force Commit Available Recruits

No Node.js installation required -- a portable `node.exe` is included.

## Usage

Double-click one of the batch files, or run from a terminal:

```
force-commit.bat                          # auto-detect saves folder, pick save interactively
force-commit-dry-run.bat                  # preview results without writing changes (verbose)
set-coach-fastest.bat                     # set CoachXPSpeed to Fastest
```

You can also run `set-coach-fastest.bat` to set your Coach XP speed to Fastest. It uses the same save picker as the force-commit tools.

### Advanced (terminal)

```
force-commit.bat DYNASTY-WII              # run on a specific save by name
force-commit.bat --dry-run                # preview without writing changes
force-commit.bat --verbose                # include full debug log in output
force-commit.bat --dry-run --verbose      # combine flags
```

### Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Run the matching logic but skip writing changes and creating a backup |
| `--verbose` | Print the full debug log after results |
