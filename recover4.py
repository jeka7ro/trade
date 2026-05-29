import json
import re
import glob
import os

brain_path = '/Users/eugeniucazmal/.gemini/antigravity-ide/brain/*/.system_generated/logs/transcript.jsonl'
lines = {}

for transcript_path in glob.glob(brain_path):
    print(f"Scanning {transcript_path}")
    try:
        with open(transcript_path, 'r') as f:
            for line in f:
                try:
                    step = json.loads(line)
                    content = step.get('content', '')
                    if 'TradePro_AI.html' in content:
                        for p in content.split('\\n'):
                            p = p.replace('\\n', '')
                            match = re.match(r'^(\d+):\s(.*)$', p)
                            if match:
                                lnum = int(match.group(1))
                                lcontent = match.group(2)
                                lines[lnum] = lcontent
                except:
                    pass
    except Exception as e:
        print(f"Failed to open {transcript_path}: {e}")

if lines:
    print(f"Recovered {len(lines)} lines from ALL conversations!")
    with open('/Users/eugeniucazmal/Downloads/dev_office/trade/TradePro_AI.html', 'w') as f:
        for i in range(1, max(lines.keys()) + 1):
            f.write(lines.get(i, '') + '\n')
    print("Saved to TradePro_AI.html")
else:
    print("No lines found in any conversation transcript.")
