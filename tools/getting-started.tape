# VHS tape for the onboarding GIF: vhs tools/getting-started.tape (from repo root)
Output docs/getting-started.gif

Set FontSize 14
Set Width 1100
Set Height 640
Set Padding 18
Set Theme "Dracula"
Set TypingSpeed 30ms

Hide
Type "mkdir -p /tmp/uxloom-demo && cp examples/shopmweb/uxloom.generated.project.json /tmp/uxloom-demo/uxloom.project.json && cd /tmp/uxloom-demo && alias uxloom='node ~/Projects/Claude/uxloom/packages/mcp-server/dist/cli.js' && clear"
Enter
Show

Type "# 1. connect UXLoom to Claude Code"
Enter
Sleep 800ms
Type "claude mcp add uxloom -s project -- npx -y uxloom"
Sleep 500ms
Enter
Sleep 3s

Type "# 2. your agent designs; UXLoom proves what's missing"
Enter
Sleep 800ms
Type "uxloom check uxloom.project.json"
Sleep 500ms
Enter
Sleep 7s
