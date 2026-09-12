"""Exercise both native AFM output guards with the reported raw-JSON response."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
checks = [
    ('apps/lakeside-ios/Shared/AskPrompt.swift', 'enum ToolProtocolSanitizer', 'ToolProtocolSanitizer'),
    ('apps/desktop/src-tauri/plugins/briefing-widgets/ios/Sources/FoundationModelBridge.swift', 'private enum NativeAskToolProtocolSanitizer', 'NativeAskToolProtocolSanitizer'),
]
for path, marker, name in checks:
    source = (root / path).read_text()
    start = source.index(marker)
    end = source.index('\n}\n', start) + 3
    guard = source[start:end].replace('private enum', 'enum')
    tests = r'''
let reported = #"{"actions":{"definition":"Actions are your activity budget.","base_count":"4 base actions."}}"#
assert(GUARD.containsProtocol(reported), "Raw JSON must trigger prose recovery")
assert(GUARD.containsProtocol("```json\n" + reported + "\n```"), "Fenced JSON must trigger recovery")
assert(GUARD.containsProtocol("<tool_call>lookup</tool_call>"))
assert(!GUARD.containsProtocol("Actions are your activity budget.\n\n- You receive actions each turn."))
assert(!GUARD.containsProtocol("Use {braces} when describing a placeholder."))
print("GUARD: 5 regression checks passed")
'''.replace('GUARD', name)
    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / 'main.swift'
        script.write_text('import Foundation\n' + guard + tests)
        subprocess.run(['swift', str(script)], check=True)
