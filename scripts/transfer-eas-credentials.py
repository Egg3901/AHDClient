#!/usr/bin/env python3
"""Copy existing release secrets directly to the fixed Ops EAS project."""
import json
import os
import urllib.request

PROJECT = "cca67185-7e31-4317-be14-02b573e97221"
NAMES = ["APPLE_API_ISSUER", "APPLE_API_KEY", "APPLE_API_KEY_CONTENT", "APPLE_DEVELOPMENT_TEAM", "LAKESIDE_TESTFLIGHT_EMAIL"]

def main():
    if not os.environ.get("EXPO_TOKEN") or any(not os.environ.get(name) for name in NAMES):
        raise RuntimeError("Required release secrets are missing")
    lookup = urllib.request.Request("https://api.expo.dev/graphql", data=json.dumps({"query": "query($id:String!){app{byId(appId:$id){environmentVariables{ name }}}}", "variables": {"id": PROJECT}}).encode(), headers={"Authorization": "Bearer " + os.environ["EXPO_TOKEN"], "Content-Type": "application/json", "User-Agent": "eas-cli"})
    with urllib.request.urlopen(lookup, timeout=45) as response:
        current = json.load(response)
    existing = {row["name"] for row in current["data"]["app"]["byId"]["environmentVariables"]}
    query = """mutation($input:[CreateEnvironmentVariableInput!]!,$appId:ID!){environmentVariable{createBulkEnvironmentVariablesForApp(environmentVariablesData:$input,appId:$appId){id}}}"""
    variables = {"appId": PROJECT, "input": [{"name": name, "value": os.environ[name], "visibility": "SECRET", "type": "STRING", "environments": ["production"], "overwrite": name in existing} for name in NAMES]}
    request = urllib.request.Request("https://api.expo.dev/graphql", data=json.dumps({"query": query, "variables": variables}).encode(), headers={"Authorization": "Bearer " + os.environ["EXPO_TOKEN"], "Content-Type": "application/json", "User-Agent": "eas-cli"})
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.load(response)
    if result.get("errors") or not result.get("data"):
        raise RuntimeError("EAS did not confirm credential storage")
    print("Release credentials stored as EAS secrets. No values logged.")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Credential transfer failed. Response details withheld.")
