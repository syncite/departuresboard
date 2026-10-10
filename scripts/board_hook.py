#!/usr/bin/env python3
"""Claude Code Stop hook: post the reply that just finished to the board."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from board_post import post  # noqa: E402
from board_watch import last_reply  # noqa: E402

try:
    path = json.load(sys.stdin).get('transcript_path', '')
    if path and os.path.exists(path):
        post('body', last_reply(path)[1])
except Exception:  # never block the session
    pass
