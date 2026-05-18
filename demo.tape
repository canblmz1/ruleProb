Output demo.gif

Set FontSize 14
Set Width 110
Set Height 36
Set Theme "dark"
Set PlaybackSpeed 1.2
Set TypingSpeed 40ms
Set CursorBlink false
Set Padding 20

# Başlık
Type "# RuleProbe — AI instruction compliance testing"
Sleep 500ms
Ctrl+C
Sleep 300ms

# Adım 1: Kuralları listele
Type "ruleprobe list-rules examples/basic"
Sleep 400ms
Enter
Sleep 3s

# Adım 2: Gerçek run (mock ile ama mixed sonuç gösterir)
Type "ruleprobe run examples/basic --provider mock --fail-below 0"
Sleep 400ms
Enter
Sleep 5s

# Bitiş
Sleep 2s
