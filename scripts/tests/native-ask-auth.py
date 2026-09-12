"""Run the production native Ask connection code against a deterministic transport."""
from pathlib import Path
import argparse
import os
import platform
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--simulator', help='Run the compiled tests in this booted iOS simulator')
args = parser.parse_args()

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
    if args.simulator:
        sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
        binary = Path(directory) / 'native-ask-auth'
        subprocess.run(['xcrun', '--sdk', 'iphonesimulator', 'swiftc', '-swift-version', '5',
                        '-sdk', sdk, '-target', f'{platform.machine()}-apple-ios18.0-simulator',
                        str(script), '-o', str(binary)], check=True)
        subprocess.run(['xcrun', 'simctl', 'spawn', args.simulator, str(binary)], check=True)
    else:
        subprocess.run([os.environ.get('SWIFT', 'swift'), '-swift-version', '5', str(script)], check=True)
