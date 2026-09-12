"""Run the production native Ask connection code against a deterministic transport."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'apps/desktop/src-tauri/plugins/briefing-widgets/ios/Sources/NativeAsk.swift').read_text()
# Compile the real authentication path without UI and answer-streaming APIs.
# Those APIs are not involved in connecting an already-linked account.
source = source[:source.index('  func ask(question:')] + '}\n'
for module in ['SwiftUI', 'UIKit', 'WebKit']:
    source = source.replace(f'import {module}\n', '')
if sys.platform != 'darwin':
    source = 'import FoundationNetworking\n' + source
needle = 'configuration.httpShouldSetCookies = true'
assert source.count(needle) == 1
source = source.replace(needle, needle + '\n    configuration.protocolClasses = [AuthTransport.self]')
checks = (Path(__file__).with_name('native-ask-auth.swift')).read_text()
with tempfile.TemporaryDirectory() as directory:
    script = Path(directory) / 'main.swift'
    script.write_text(source + '\n' + checks)
    subprocess.run([os.environ.get('SWIFT', 'swift'), '-swift-version', '5', str(script)], check=True)
