#!/usr/bin/env python3
"""Keep identity-bearing Apple signing output off public CI logs."""
import os
import subprocess
import sys
import tempfile


def main():
    if len(sys.argv) < 2:
        raise SystemExit('An Apple build or upload command is required.')
    with tempfile.TemporaryFile(dir=os.environ.get('RUNNER_TEMP')) as output:
        result = subprocess.run(sys.argv[1:], stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        print('Apple command failed; signing output was withheld from public logs.', file=sys.stderr)
    else:
        print('Apple command completed successfully.')
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
