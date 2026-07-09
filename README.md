Credit to JWDixon on the CFB Modding Community discord! I used one of his tools as a reference when working on this.

# Background Info
Currently in CFB 27, there is a huge issue with AI school recruiting logic under the hood. The main purpose of this tool is to be ran once at the end of the season to match unoffered recruits with schools that need them, and even out the amount of commits across all schools in the process. In my testing on signing day I have seen many schools jump from 5-8 commits to 17-25. You can see real results below.

Side note: I also included a simple set-coach-fastest.bat script which sets your coach XP to "Fastest" if you are interested. In my testing it just about doubles XP gain. Check usage for more info.

IMPORTANT: You run this tool one time, on a full save (not an autosave) during week 4 of the transfer portal period. You can run this tool while you are in the main menu, or with the game closed. The tool will make a backup of your save but I HIGHLY recommend making your own backups as well.
IMPORTANT2: This tool will target any recruit that has no offers and force them to a school. So if there is a recruit on YOUR board you want to keep, make sure you at least send them a 0 NIL offer. The tool will not touch your board otherwise. 

## Result example
On the below save, I started a new dynasty and did auto recruitment for the user team. I set number of transfers to 10. Without running the tool, on signing day there are a huge amount of schools under 15 recruits, even a large amount of schools under 10. After reloading, running the tool, and advancing again, there are only 11 schools with 19 or less recruits. Every other school has 20 or more recruits, which is a huge improvement, even if it isn't perfect. 

Signing day WITHOUT running the tool: 
<img width="1390" height="838" alt="image" src="https://github.com/user-attachments/assets/8124102f-d954-486a-beb2-cbaaf263cea3" />

What it looks like the week you load in, the tool will essentially fill out every schools board with 0 NIL forced commits as much as possible:
<img width="1420" height="890" alt="image" src="https://github.com/user-attachments/assets/2f265401-2d00-4936-b2a3-073e62ed7028" />

Sadly, either the commits themselves will decommit, or the AI will for some reason remove the committed recruits from their board (??), so not all of them stay.
What it looks like after advancing the week to signing day (only 11 teams with 19 or less commits):
<img width="1386" height="851" alt="image" src="https://github.com/user-attachments/assets/6651b49d-77e7-4606-a8d5-f32c9c49b9a8" />

Console output example:
<img width="1375" height="456" alt="image" src="https://github.com/user-attachments/assets/458aa2f4-abbc-453d-a516-5c1f3b64de00" />

Debug dry run Output example, this shows the team IDs and which positions I identified as needs for them based on position overall:
<img width="941" height="597" alt="image" src="https://github.com/user-attachments/assets/55e0fdf0-41dd-4b7d-97e3-27b1b4db4c80" />


# Force Commit Available Recruits and Set CoachXP to Fastest

## Usage
ONLY RUN FORCE-COMMIT.BAT ON A SAVE FILE THAT IS ON WEEK 4 OF THE TRANSFER PORTAL PERIOD. Very important. 
Double-click one of the batch files, or run from a terminal:

```
force-commit.bat                          # auto-detect saves folder, pick save interactively
force-commit-dry-run.bat                  # preview results without writing changes (verbose)
set-coach-fastest.bat                     # set CoachXPSpeed to Fastest
```

You can also run `set-coach-fastest.bat` to set your Coach XP speed to Fastest. It uses the same save picker as the force-commit tools. 

IMPORTANT: If you set your coach XP to fastest and then go into the League Settings menu at ANY POINT afterwards, you will need to save again and then run the set-coach-fastest.bat an additional time. Basically EA overwrites the value the moment you enter the menu

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
