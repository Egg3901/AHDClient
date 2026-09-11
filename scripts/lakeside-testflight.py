#!/usr/bin/env python3
"""Inspect delivery and invite only the explicitly configured personal tester."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import time
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
        codes = [item.get('code', 'UNKNOWN') for item in details]
        if error.code == 409 and 'STATE_ERROR.TESTER_INVITE.ALREADY_ACCEPTED' in codes:
            return {'alreadyAccepted': True}
        categories = [word for word in ['external', 'internal', 'already', 'permission', 'access'] if any(word in x.get('detail', '').lower() for x in details)]
        raise RuntimeError('Apple HTTP %s: %s (%s)' % (error.code, ', '.join(codes), ', '.join(categories))) from None


def listed(path, **filters):
    return api(path + '?' + urllib.parse.urlencode(filters))['data']


def ref(kind, identifier):
    return {'type': kind, 'id': identifier}


def main():
    email = os.environ['LAKESIDE_TESTFLIGHT_EMAIL'].strip()
    invite = os.environ.get('ACTION', 'status') == 'invite'
    expected_bundle = os.environ.get('EXPECTED_BUNDLE_ID', '').strip()
    expected_version = os.environ.get('EXPECTED_BUILD_VERSION', '').strip()
    expected_timeout = int(os.environ.get('EXPECTED_BUILD_TIMEOUT_SECONDS', '300'))
    users = listed('users', **{'filter[username]': email})
    print('Configured tester is an App Store Connect user:', bool(users))
    for bundle in ['net.lakesidegames.ahdclient', 'net.lakesidegames.ask', 'net.lakesidegames.ops']:
        apps = listed('apps', **{'filter[bundleId]': bundle})
        if len(apps) != 1:
            raise RuntimeError(bundle + ': app record missing or ambiguous')
        app_id = apps[0]['id']
        deadline = time.time() + expected_timeout if bundle == expected_bundle and expected_version else 0
        build = None
        builds = []
        while True:
            builds = listed('builds', **{'filter[app]': app_id, 'sort': '-uploadedDate', 'limit': 20})
            match_version = expected_version if bundle == expected_bundle else ''
            build = next((item for item in builds if not match_version or item['attributes'].get('version') == match_version), None)
            if bundle != expected_bundle or not expected_version or build is not None or time.time() >= deadline:
                break
            time.sleep(15)
        print(bundle, 'app record found; builds:', len(builds))
        if not builds:
            if invite:
                raise RuntimeError(bundle + ': no uploaded build')
            continue
        if bundle == expected_bundle and expected_version and build is None:
            latest = builds[0]['attributes'].get('version', 'unknown')
            raise RuntimeError(bundle + ': expected build ' + expected_version + ' not found; latest is ' + latest)
        detail = api('builds/' + build['id'] + '/buildBetaDetail')['data']['attributes']
        print(bundle, 'build', build['attributes']['version'], build['attributes']['processingState'],
              'internal:', detail.get('internalBuildState'), 'external:', detail.get('externalBuildState'))
        access_groups = listed('betaGroups', **{'filter[app]': app_id, 'limit': 200})
        configured_testers = listed('betaTesters', **{'filter[email]': email})
        for access_group in access_groups:
            if access_group['attributes']['name'] != 'Personal iOS' or not access_group['attributes']['isInternalGroup']:
                continue
            member_ids = {t['id'] for t in api('betaGroups/' + access_group['id'] + '/relationships/betaTesters?limit=200')['data']}
            build_ids = {b['id'] for b in api('betaGroups/' + access_group['id'] + '/relationships/builds?limit=200')['data']}
            print(bundle, 'configured tester in internal group:', any(t['id'] in member_ids for t in configured_testers),
                  'latest build assigned:', build['id'] in build_ids)
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
        members = api('betaGroups/' + group['id'] + '/relationships/betaTesters?limit=200')['data']
        tester = next((t for t in testers if any(member['id'] == t['id'] for member in members)), None)
        if tester is None:
            # Apple must establish internal membership when resolving the tester by email.
            tester = api('betaTesters', {'data': {'type': 'betaTesters', 'attributes': {'email': email},
                'relationships': {'betaGroups': {'data': [ref('betaGroups', group['id'])]}}}})['data']
        invitation = api('betaTesterInvitations', {'data': {'type': 'betaTesterInvitations', 'relationships': {
            'app': {'data': ref('apps', app_id)}, 'betaTester': {'data': ref('betaTesters', tester['id'])}}}})
        print(bundle, 'TestFlight access confirmed' if invitation.get('alreadyAccepted') else 'TestFlight invitation requested successfully')


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='lakeside-apple-') as temp:
        key = Path(temp) / 'signing.p8'
        value = os.environ['APPLE_API_KEY_CONTENT'].strip()
        key.write_bytes(value.encode() if value.startswith('-----BEGIN PRIVATE KEY-----') else base64.b64decode(''.join(value.split()), validate=True))
        key.chmod(0o600)
        os.environ['APPLE_API_KEY_PATH'] = str(key)
        main()
