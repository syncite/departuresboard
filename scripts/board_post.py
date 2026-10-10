#!/usr/bin/env python3
"""Post to the Claude board at departures.syncite.net.

    board_post.py headline "Short options line"
    board_post.py body "Full reply text"        (or text on stdin)

The token is read from $DEPARTURES_TOKEN or ~/.departures-token. Without one
this exits quietly, so hooks never fail a session.
"""
import json
import os
import sys
import urllib.request

URL = 'https://departures.syncite.net/api/post'


def token():
    if os.environ.get('DEPARTURES_TOKEN'):
        return os.environ['DEPARTURES_TOKEN'].strip()
    try:
        with open(os.path.expanduser('~/.departures-token')) as f:
            return f.read().strip()
    except OSError:
        return ''


def post(kind, text):
    tok = token()
    if not tok or not text.strip():
        return False
    req = urllib.request.Request(URL, data=json.dumps({'kind': kind, 'text': text}).encode(), headers={
        'Authorization': f'Bearer {tok}',
        'Content-Type': 'application/json',
        'User-Agent': 'claude-board/1.0',
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except OSError:
        return False


if __name__ == '__main__':
    kind = sys.argv[1] if len(sys.argv) > 1 else 'body'
    text = ' '.join(sys.argv[2:]) if len(sys.argv) > 2 else sys.stdin.read()
    sys.exit(0 if post(kind, text) or not token() else 1)
