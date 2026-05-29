import json
import re

transcript_path = '/Users/eugeniucazmal/.gemini/antigravity-ide/brain/dd102a49-93d7-4e3f-bbff-57f42a95970b/.system_generated/logs/transcript.jsonl'
lines = {}

with open(transcript_path, 'r') as f:
    for line in f:
        try:
            step = json.loads(line)
            if step.get('type') == 'VIEW_FILE' and 'TradePro_AI.html' in step.get('content', ''):
                content = step.get('content', '')
                for p in content.split('\n'):
                    match = re.match(r'^(\d+):\s(.*)$', p)
                    if match:
                        lnum = int(match.group(1))
                        lcontent = match.group(2)
                        lines[lnum] = lcontent
        except:
            pass

if lines:
    print(f"Recovered {len(lines)} lines")
    with open('/Users/eugeniucazmal/Downloads/dev_office/trade/TradePro_AI.html', 'w') as f:
        for i in range(1, max(lines.keys()) + 1):
            f.write(lines.get(i, '') + '\n')
    print("Saved to TradePro_AI.html")
else:
    print("No lines found")
