#!/usr/bin/env python3
"""Tiny SSH wrapper for one-shot remote commands and SCP uploads.

Reads the password from MARKETING_AI_DEPLOY_PW so it doesn't end up
in shell history. Usage:
  python ssh.py exec "<bash command>"
  python ssh.py put <local-path> <remote-path>
"""

from __future__ import annotations

import io
import os
import sys
from pathlib import Path

import paramiko

# Default Windows console encoding (cp1252) blows up on Unicode in
# `systemctl status` output (the green ● bullet). Force UTF-8 on
# stdout/stderr so we can ferry remote output back verbatim.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HOST = "165.245.176.204"
USER = "root"
PORT = 22


def make_client() -> paramiko.SSHClient:
    pw = os.environ.get("MARKETING_AI_DEPLOY_PW")
    if not pw:
        sys.stderr.write("MARKETING_AI_DEPLOY_PW env var is not set\n")
        sys.exit(2)
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(
        HOST,
        port=PORT,
        username=USER,
        password=pw,
        allow_agent=False,
        look_for_keys=False,
        timeout=30,
    )
    return c


def cmd_exec(command: str) -> int:
    client = make_client()
    try:
        # request_pty so apt prompts get suppressed via DEBIAN_FRONTEND
        stdin, stdout, stderr = client.exec_command(
            command,
            get_pty=False,
            timeout=600,
            environment={"DEBIAN_FRONTEND": "noninteractive"},
        )
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        rc = stdout.channel.recv_exit_status()
        if out:
            sys.stdout.write(out)
        if err:
            sys.stderr.write(err)
        return rc
    finally:
        client.close()


def cmd_put(local: str, remote: str) -> int:
    client = make_client()
    try:
        sftp = client.open_sftp()
        sftp.put(local, remote)
        sftp.close()
        return 0
    finally:
        client.close()


def main() -> int:
    if len(sys.argv) < 2:
        sys.stderr.write("usage: ssh.py exec '<cmd>' | put <local> <remote>\n")
        return 2
    op = sys.argv[1]
    if op == "exec":
        if len(sys.argv) != 3:
            sys.stderr.write("exec needs exactly one command argument\n")
            return 2
        return cmd_exec(sys.argv[2])
    if op == "put":
        if len(sys.argv) != 4:
            sys.stderr.write("put needs <local> <remote>\n")
            return 2
        return cmd_put(sys.argv[2], sys.argv[3])
    sys.stderr.write(f"unknown op: {op}\n")
    return 2


if __name__ == "__main__":
    sys.exit(main())
