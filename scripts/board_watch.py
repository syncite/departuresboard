#!/usr/bin/env python3
"""Watch a Claude Code transcript and post each finished reply to the board.

Run detached; it polls the newest transcript once a second and posts the text
of every new end-of-turn assistant message as the board message's body.
    board_watch.py [transcript-dir]
"""
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from board_post import post  # noqa: E402

DIR = sys.argv[1] if __name__ == '__main__' and len(sys.argv) > 1 else os.path.expanduser('~/.claude/projects')


def last_reply(path):
    """(uuid, text) of the last finished assistant reply in a transcript."""
    found = (None, '')
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if '"end_turn"' not in line:
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            msg = rec.get('message') or {}
            if rec.get('type') == 'assistant' and msg.get('stop_reason') == 'end_turn':
                text = '\n'.join(c.get('text', '') for c in msg.get('content', []) if c.get('type') == 'text').strip()
                if text:
                    found = (rec.get('uuid'), text)
    return found


def newest():
    files = glob.glob(os.path.join(DIR, '**', '*.jsonl'), recursive=True)
    return max(files, key=os.path.getmtime) if files else None


def main():
    seen = {}
    while True:
        path = newest()
        if path:
            size = os.path.getsize(path)
            if seen.get(path, (None, -1))[1] != size:
                uuid, text = last_reply(path)
                if path not in seen:
                    seen[path] = (uuid, size)       # start from now; don't repost history
                elif uuid and uuid != seen[path][0]:
                    if post('body', text):
                        seen[path] = (uuid, size)
                else:
                    seen[path] = (seen[path][0], size)
        time.sleep(1)


if __name__ == '__main__':
    main()
