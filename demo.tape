Output docs/demo.gif

Set FontSize 18
Set Width 120
Set Height 38
Set Theme "Dracula"
Set PlaybackSpeed 0.8
Set TypingSpeed 60ms
Set CursorBlink false
Set Padding 16

# --- RuleProbe demo: extract rules, then run with --demo flag ---

Type "ruleprobe list-rules examples/strict"
Enter
Sleep 4s

Type "ruleprobe run examples/strict --demo --fail-below 0"
Enter
Sleep 12s

Sleep 2s
