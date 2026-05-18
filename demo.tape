Output demo.gif

Set FontSize 22
Set Width 1400
Set Height 800
Set Theme "Dark+"
Set PlaybackSpeed 1.0
Set TypingSpeed 50ms
Set CursorBlink false
Set Padding 24

# Show rule extraction
Type "ruleprobe list-rules examples/strict"
Enter
Sleep 5s

# Show compliance run
Type "ruleprobe run examples/strict --provider mock --fail-below 0"
Enter
Sleep 8s

Sleep 2s
