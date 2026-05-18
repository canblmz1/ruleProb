Output demo.gif

Set FontSize 13
Set Width 120
Set Height 38
Set Theme "dark"
Set PlaybackSpeed 1.2
Set TypingSpeed 35ms
Set CursorBlink false
Set Padding 20

# Step 1: list-rules (strict example)
Type "ruleprobe list-rules examples/strict"
Sleep 400ms
Enter
Sleep 4s

# Step 2: run with mock provider
Type "ruleprobe run examples/strict --provider mock --fail-below 0"
Sleep 400ms
Enter
Sleep 6s

Sleep 2s
