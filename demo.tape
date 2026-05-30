Output docs/demo.gif

Set FontSize 14
Set Width 1200
Set Height 600
Set Theme "Dracula"
Set PlaybackSpeed 0.75
Set TypingSpeed 50ms
Set CursorBlink false
Set Padding 20

# --- RuleProbe demo: extract rules, then compliance test ---

Type "ruleprobe list-rules examples/strict"
Enter
Sleep 3500ms

Type "ruleprobe run examples/strict --demo --fail-below 0"
Enter
Sleep 14s

Sleep 1500ms
