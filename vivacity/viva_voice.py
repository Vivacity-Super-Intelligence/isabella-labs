"""Opt-in, short-lived browser voice credentials with a separate project budget.

The provider project must also enforce its own $5 monthly cap. A local ledger
cannot account for sessions after the browser has received a provider token.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import os
import time
import uuid

import httpx

from .runtime import Busy, Unavailable
from .workspace import owner


class VoiceService:
    RESERVATION_USD = .20
    ADMISSION_CUTOFF_USD = 4.00

    def __init__(self, store):
        self.store = store
        with store.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS viva_voice_sessions(
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, ip_hash TEXT NOT NULL,
                month TEXT NOT NULL, issued_unix_s REAL NOT NULL,
                reserved_usd REAL NOT NULL, status TEXT NOT NULL)''')

    @staticmethod
    def configured() -> bool:
        return bool(os.getenv('OPENAI_VOICE_API_KEY')) and os.getenv('VIVACITY_VOICE_PROJECT_LIMIT_USD') == '5'

    def create(self, token: str, ip: str) -> dict:
        if not self.configured():
            raise Unavailable('Voice requires a dedicated OpenAI project key and an enforced $5 monthly project limit. Typed commands remain available.')
        month = datetime.now(timezone.utc).strftime('%Y-%m')
        now = time.time()
        ip_hash = hashlib.sha256(ip.encode()).hexdigest()
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            amount = db.execute('SELECT COALESCE(SUM(reserved_usd),0) FROM viva_voice_sessions WHERE month=?', (month,)).fetchone()[0]
            if amount + self.RESERVATION_USD > self.ADMISSION_CUTOFF_USD + 1e-9:
                raise Busy('Voice admission is closed for this month. Typed commands remain available.')
            owner_count = db.execute('SELECT COUNT(*) FROM viva_voice_sessions WHERE owner=? AND issued_unix_s>?',
                                     (owner(token), now-3600)).fetchone()[0]
            ip_count = db.execute('SELECT COUNT(*) FROM viva_voice_sessions WHERE ip_hash=? AND issued_unix_s>?',
                                  (ip_hash, now-3600)).fetchone()[0]
            if owner_count >= 2 or ip_count >= 12:
                raise Busy('Voice session rate limit reached. Try later or type your request.')
            identifier = str(uuid.uuid4())
            db.execute('INSERT INTO viva_voice_sessions VALUES(?,?,?,?,?,?,?)',
                       (identifier, owner(token), ip_hash, month, now, self.RESERVATION_USD, 'issuing'))
        body = {
            'expires_after': {'anchor': 'created_at', 'seconds': 60},
            'session': {
                'type': 'realtime', 'model': os.getenv('VIVACITY_VOICE_MODEL', 'gpt-realtime-2.1-mini'),
                'output_modalities': ['audio'],
                'instructions': 'You are Viva. Do not answer user audio automatically. When explicitly asked to speak a verified action report, say only the report in the user language, warmly and briefly. Never invent a simulation result.',
                'audio': {
                    'input': {'transcription': {'model': 'gpt-live-transcribe', 'languages': ['en', 'hi'],
                                                'keywords': ['Vivacity', 'Viva', 'UR5e', 'Franka Panda', 'MuJoCo']},
                              'turn_detection': {'type': 'server_vad', 'create_response': False,
                                                 'interrupt_response': False, 'silence_duration_ms': 600}},
                    'output': {'voice': 'marin'},
                },
                'max_output_tokens': 160,
            },
        }
        try:
            result = httpx.post('https://api.openai.com/v1/realtime/client_secrets',
                                headers={'Authorization': 'Bearer '+os.environ['OPENAI_VOICE_API_KEY']},
                                json=body, timeout=12)
            result.raise_for_status()
            payload = result.json()
            secret = payload['value']
            expiry = int(payload['expires_at'])
            if not secret or expiry <= now:
                raise ValueError('invalid provider credential')
        except (httpx.HTTPError, KeyError, ValueError):
            with self.store.connect() as db:
                db.execute('UPDATE viva_voice_sessions SET status=?, reserved_usd=0 WHERE id=?', ('provider_failed', identifier))
            raise Unavailable('Voice provider could not start a session. Typed commands remain available.') from None
        with self.store.connect() as db:
            db.execute('UPDATE viva_voice_sessions SET status=? WHERE id=?', ('issued', identifier))
        return {'schema_version': 'vivacity.voice-session/1.0', 'id': identifier,
                'client_secret': secret, 'expires_at': expiry, 'max_seconds': 180}

    def stop(self, identifier: str, token: str) -> dict:
        with self.store.connect() as db:
            row = db.execute('SELECT status FROM viva_voice_sessions WHERE id=? AND owner=?',
                             (identifier, owner(token))).fetchone()
            if row is None:
                raise KeyError(identifier)
            db.execute('UPDATE viva_voice_sessions SET status=? WHERE id=?', ('closed', identifier))
        return {'schema_version': 'vivacity.voice-stop/1.0', 'id': identifier, 'status': 'closed'}
