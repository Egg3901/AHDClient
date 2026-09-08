#!/usr/bin/env python3
"""Inspect delivery and invite only the explicitly configured personal tester."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('apple', ROOT / 'apps/lakeside-ios/scripts/apple.py')
apple = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apple)


def api(path, body=None):
    request = urllib.request.Request('https://api.appstoreconnect.apple.com/v1/' + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': 'Bearer ' + apple.token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        # Apple errors may echo a tester email. Never write their raw payload to public logs.
        details = json.loads(error.read()).get('errors', [])
        raise RuntimeError('Apple HTTP %s: %s' % (error.code, ', '.join(x.get('code', 'UNKNOWN') for x in details))) from None


def listed(path, **filters):
    return api(path + '?' + urllib.parse.urlencode(filters))['data']


def ref(kind, identifier):
    return {'type': kind, 'id': identifier}


def main():
    email = os.environ['LAKESIDE_TESTFLIGHT_EMAIL'].strip()
    invite = os.environ.get('ACTION', 'status') == 'invite'
    users = listed('users', **{'filter[username]': email})
    print('Configured tester is an App Store Connect user:', bool(users))
    for bundle in ['net.lakesidegames.ask', 'net.lakesidegames.ops']:
        apps = listed('apps', **{'filter[bundleId]': bundle})
        if len(apps) != 1:
            raise RuntimeError(bundle + ': app record missing or ambiguous')
        app_id = apps[0]['id']
        builds = listed('builds', **{'filter[app]': app_id, 'sort': '-uploadedDate', 'limit': 1})
        print(bundle, 'app record found; builds:', len(builds))
        if not builds:
            if invite:
                raise RuntimeError(bundle + ': no uploaded build')
            continue
        build = builds[0]
        detail = api('builds/' + build['id'] + '/buildBetaDetail')['data']['attributes']
        print(bundle, 'build', build['attributes']['version'], build['attributes']['processingState'],
              'internal:', detail.get('internalBuildState'), 'external:', detail.get('externalBuildState'))
        if not invite:
            continue
        if not users:
            raise RuntimeError('Configured tester is not an existing App Store Connect user; external testing requires beta review')
        if build['attributes']['processingState'] != 'VALID' or detail.get('internalBuildState') not in ['READY_FOR_BETA_TESTING', 'IN_BETA_TESTING']:
            raise RuntimeError(bundle + ': build is not ready for internal testing')
        groups = listed('betaGroups', **{'filter[app]': app_id, 'limit': 200})
        groups = [g for g in groups if g['attributes']['name'] == 'Personal iOS' and g['attributes']['isInternalGroup']]
        group = groups[0] if groups else api('betaGroups', {'data': {'type': 'betaGroups',
            'attributes': {'name': 'Personal iOS', 'isInternalGroup': True, 'hasAccessToAllBuilds': True, 'publicLinkEnabled': False},
            'relationships': {'app': {'data': ref('apps', app_id)}}}})['data']
        testers = listed('betaTesters', **{'filter[email]': email})
        tester = testers[0] if testers else api('betaTesters', {'data': {'type': 'betaTesters', 'attributes': {'email': email}}})['data']
        members = api('betaGroups/' + group['id'] + '/relationships/betaTesters?limit=200')['data']
        if not any(t['id'] == tester['id'] for t in members):
            api('betaGroups/' + group['id'] + '/relationships/betaTesters', {'data': [ref('betaTesters', tester['id'])]})
        api('betaTesterInvitations', {'data': {'type': 'betaTesterInvitations', 'relationships': {
            'app': {'data': ref('apps', app_id)}, 'betaTester': {'data': ref('betaTesters', tester['id'])}}}})
        print(bundle, 'TestFlight invitation requested successfully')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='lakeside-apple-') as temp:
        key = Path(temp) / 'signing.p8'
        value = os.environ['APPLE_API_KEY_CONTENT'].strip()
        key.write_bytes(value.encode() if value.startswith('-----BEGIN PRIVATE KEY-----') else base64.b64decode(''.join(value.split()), validate=True))
        key.chmod(0o600)
        os.environ['APPLE_API_KEY_PATH'] = str(key)
        main()
