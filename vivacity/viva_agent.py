"""Typed, owner-scoped workspace requests. Speech is input; physics remains authoritative.

This service records an ordered command plan. The browser executes each step through
the same validated API used by the visible controls and reports its result here.
Reported step status is an interaction audit, never a simulation measurement.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from typing import Any, Literal

from pydantic import Field, model_validator

from .schemas import Schema
from .storage import encode
from .workspace import owner


ActionKind = Literal[
    'select_world', 'select_robot', 'select_operation', 'set_mass',
    'set_friction', 'set_object_position', 'set_destination', 'set_quality',
    'run_experiment', 'pause', 'resume', 'compare', 'replay', 'export',
    'generate_environment', 'import_folder', 'create_robot', 'undo',
]


class AgentAction(Schema):
    kind: ActionKind
    arguments: dict[str, Any] = Field(default_factory=dict)
    label: str = Field(min_length=1, max_length=180)
    status: Literal['pending', 'completed', 'failed', 'cancelled'] = 'pending'
    outcome: str | None = None
    evidence: dict[str, Any] | None = None


class AgentTurnRequest(Schema):
    schema_version: Literal['vivacity.agent-request/1.0'] = 'vivacity.agent-request/1.0'
    utterance: str = Field(min_length=2, max_length=2000)
    world_id: str | None = None
    expected_revision: int | None = Field(None, ge=0)

    @model_validator(mode='after')
    def context(self):
        if (self.world_id is None) != (self.expected_revision is None):
            raise ValueError('world ID and expected revision must be supplied together')
        return self


class AgentStepOutcome(Schema):
    success: bool
    message: str = Field(min_length=1, max_length=500)
    world_id: str | None = None
    world_revision: int | None = Field(None, ge=0)
    experiment_id: str | None = None
    design_id: str | None = None


class AgentRequestResponse(Schema):
    schema_version: Literal['vivacity.agent-plan/1.0'] = 'vivacity.agent-plan/1.0'
    id: str
    utterance: str
    status: Literal['planned', 'running', 'completed', 'failed', 'cancelled', 'needs_clarification']
    explanation: str
    actions: list[AgentAction]
    world_id: str | None = None
    expected_revision: int | None = None
    created_unix_s: float
    updated_unix_s: float


_NUMBER = r'(-?[0-9]+(?:\.[0-9]+)?)'
_SPLIT = re.compile(r'\b(?:and then|after that|and(?!\s+place\b)|then|phir|fir|uske baad|aur phir)\b|और|फिर|उसके बाद', re.I)
_WAKE = re.compile(r'^\s*(?:hey\s+viva|hi\s+viva|viva|हे\s+वीवा|वीवा)[,!:;\s]*', re.I)
_CORRECTION = re.compile(r'\b(?:no(?:,?\s*wait)?|actually|sorry|i mean|instead)\b', re.I)
_NEGATION = re.compile(r"\b(?:don['’]t|do not|never|nahi|nahin|mat)\b|मत|नहीं", re.I)


def _action(kind: ActionKind, label: str, **arguments) -> AgentAction:
    return AgentAction(kind=kind, label=label, arguments=arguments)


def _coordinates(text: str) -> list[float] | None:
    x = re.search(r'\bx\s*(?:=|:|to|at)?\s*(-?[0-9]+(?:\.[0-9]+)?)', text)
    y = re.search(r'\by\s*(?:=|:|to|at)?\s*(-?[0-9]+(?:\.[0-9]+)?)', text)
    return [float(x.group(1)), float(y.group(1))] if x and y else None


def parse_actions(utterance: str) -> tuple[list[AgentAction], str]:
    """Parse common spoken commands, preserving sequence and failing closed.

    The parser is intentionally bounded. A future model may propose the same typed
    actions, but it will not gain permission to invent simulator capabilities.
    """
    spoken = _WAKE.sub('', utterance.strip()).lower()
    parts = [p.strip(' ,.;:') for p in _SPLIT.split(spoken) if p.strip(' ,.;:')]
    actions: list[AgentAction] = []
    for part in parts:
        if _CORRECTION.search(part):
            part = _CORRECTION.split(part)[-1].strip(' ,.;:')
            if not part:
                return [], 'Say the full corrected action before I change the world.'
        if _NEGATION.search(part):
            return [], 'I will not execute a negated command. Say the action you want me to perform.'
        step: list[AgentAction] = []
        robot = next((name for name in ('ur5e', 'panda', 'iiwa', 'gen3', 'xarm7', 'scara', 'dual_arm')
                      if re.search(r'\b' + re.escape(name) + r'\b', part)), None)
        if robot is None and re.search(r'\b(?:six|6)\s*(?:dof|degrees? of freedom|axis|axes)\b|छह\s*(?:डिग्री|अक्ष)', part):
            robot = 'ur5e'
        if robot and re.search(r'\b(?:robot|arm|dof|axis|axes|choose|select|use|chahiye)\b|रोबोट|बांह', part):
            step.append(_action('select_robot', f'Select {robot.upper()} robotic arm', robot_id=robot))

        world = next((key for key, terms in (
            ('warehouse', ('warehouse', 'गोदाम', 'godam')),
            ('robotics_lab', ('robotics lab', 'robotics laboratory', 'रोबोटिक्स लैब')),
            ('desktop', ('desktop world', 'tabletop', 'desk world')),
        ) if any(term in part for term in terms)), None)
        if world and re.search(r'\b(?:world|environment|lab|warehouse|load|select|choose)\b|दुनिया|वातावरण|गोदाम', part):
            step.append(_action('select_world', f'Select {world.replace("_", " ")} world', environment_id=world))

        if re.search(r'\b(?:high fidelity|high quality|best graphics|highest quality)\b|उच्च गुणवत्ता', part):
            step.append(_action('set_quality', 'Set high visual quality', quality='high'))
        if re.search(r'\b(?:sorting|sort|sort kar|chhanto|chhant)\b|छाँट|छांट', part):
            step.append(_action('select_operation', 'Select measured sorting task', operation_id='sorting'))
        elif re.search(r'\b(?:pick and place|pick.?place|pickup|pick up)\b|उठाकर रख', part):
            step.append(_action('select_operation', 'Select pick and place task', operation_id='pick_place'))

        mass_context = re.search(r'\b(?:mass|weight|heavy|heavier|lighter|wazan|vajan|bhaari|bhari)\b|वजन|भार|भारी', part)
        if mass_context:
            explicit = re.search(r'(?:mass|weight|वजन|wazan|vajan|भार)[^0-9-]{0,28}' + _NUMBER + r'\s*(kg|kilograms?|g|grams?|ग्राम|ग्रा|किलो)?', part)
            if explicit:
                value = float(explicit.group(1)) / (1000 if explicit.group(2) in ('g', 'gram', 'grams', 'ग्राम', 'ग्रा') else 1)
                step.append(_action('set_mass', f'Set object mass to {value:g} kg', value_kg=value))
            elif re.search(r'\b(?:heavy|heavier|increase|badhao|badha|bhaari|bhari)\b|भारी|बढ़ा', part):
                step.append(_action('set_mass', 'Increase object mass by 25%', multiplier=1.25))
            elif re.search(r'\b(?:lighter|decrease|ghatao|kam)\b|हल्का|घटा', part):
                step.append(_action('set_mass', 'Decrease object mass by 25%', multiplier=.75))
            else:
                return [], 'Say the object mass in kilograms, or ask to make it heavier or lighter.'

        if re.search(r'\b(?:friction|grip friction|gharsan)\b|घर्षण', part):
            explicit = re.search(r'(?:friction|gharsan|घर्षण)[^0-9]{0,22}' + _NUMBER, part)
            if not explicit:
                return [], 'Say the new friction coefficient, for example “set friction to 0.8”.'
            step.append(_action('set_friction', f'Set sliding friction to {explicit.group(1)}', value=float(explicit.group(1))))

        position = _coordinates(part)
        if position and re.search(r'\b(?:destination|target|red marker|place location)\b|गंतव्य', part):
            step.append(_action('set_destination', 'Move placement destination', xy_m=position))
        elif position and re.search(r'\b(?:object|cube|blue block)\b|वस्तु|घन', part):
            step.append(_action('set_object_position', 'Move pickup object', xy_m=position))

        if re.search(r'\b(?:pause|hold simulation|ruk|roko)\b|रोक', part):
            step.append(_action('pause', 'Pause live simulation'))
        elif re.search(r'\b(?:resume|continue simulation|chalu)\b|जारी', part):
            step.append(_action('resume', 'Resume live simulation'))
        if re.search(r'\b(?:compare|comparison)\b|तुलना', part):
            step.append(_action('compare', 'Open recorded outcome comparisons'))
        if re.search(r'\b(?:replay|play it again)\b|दोबारा', part):
            step.append(_action('replay', 'Replay measured trajectory'))
        if re.search(r'\b(?:export|download)\b|निर्यात|डाउनलोड', part):
            step.append(_action('export', 'Export measured result'))
        if re.search(r'\b(?:undo|revert|go back)\b|पूर्ववत|वापस करो', part):
            step.append(_action('undo', 'Undo last Viva world edit'))

        if re.search(r'\b(?:import|upload)\b|आयात', part) and re.search(r'\b(?:folder|directory|files?|path|world|robot)\b|फ़ोल्डर', part):
            step.append(_action('import_folder', 'Choose a local robot or world file'))
        elif re.search(r'\b(?:create|design|generate|banao|bana do)\b|बनाओ|बनाएं', part) and re.search(r'\b(?:robot|arm)\b|रोबोट|बांह', part) and not robot:
            step.append(_action('create_robot', 'Create a bounded robot design draft', description=part))
        elif re.search(r'\b(?:create|design|generate|banao|bana do)\b|बनाओ|बनाएं', part) and re.search(r'\b(?:world|environment|scene)\b|दुनिया|वातावरण', part):
            step.append(_action('generate_environment', 'Generate a bounded world specification', prompt=part, provider='openai'))

        if re.search(r'\b(?:run|start|simulate|simulation|experiment|execute|dikhao)\b|चलाओ|प्रयोग', part) and not any(a.kind in ('pause', 'resume', 'replay') for a in step):
            step.append(_action('run_experiment', 'Start real physics experiment'))
        if not step:
            return [], f'I could not map “{part[:100]}” to a supported workspace action.'
        actions.extend(step)
    return actions, 'Actions are executed in the order spoken. Physics results come from the runtime.'


class AgentService:
    def __init__(self, workspace):
        self.workspace = workspace
        self.store = workspace.store
        with self.store.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS agent_requests(
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, key TEXT NOT NULL,
                fingerprint TEXT NOT NULL, payload TEXT NOT NULL,
                UNIQUE(owner,key))''')

    def _get(self, identifier: str, token: str, db=None) -> dict:
        if db is None:
            with self.store.connect() as connection:
                return self._get(identifier, token, connection)
        row = db.execute('SELECT payload FROM agent_requests WHERE id=? AND owner=?',
                         (identifier, owner(token))).fetchone()
        if row is None:
            raise KeyError(identifier)
        return json.loads(row[0])

    def _save(self, record: dict, token: str, db):
        db.execute('UPDATE agent_requests SET payload=? WHERE id=? AND owner=?',
                   (encode(record), record['id'], owner(token)))

    def create(self, request: AgentTurnRequest, token: str, key: str, session_token: str | None = None) -> dict:
        fingerprint = hashlib.sha256(encode(request.model_dump()).encode()).hexdigest()
        with self.store.connect() as db:
            prior = db.execute('SELECT fingerprint,payload FROM agent_requests WHERE owner=? AND key=?',
                               (owner(token), key)).fetchone()
        if prior:
            if prior[0] != fingerprint:
                from .runtime import Conflict
                raise Conflict('idempotency key was reused for a different request')
            return json.loads(prior[1])
        if request.world_id:
            self.workspace.runtime.supervisor.authorize_world(request.world_id, session_token)
            world = self.workspace.runtime.get_world(request.world_id)
            if world['revision'] != request.expected_revision:
                from .runtime import Conflict
                raise Conflict('world revision changed; reload before asking Viva to edit it')
        actions, explanation = parse_actions(request.utterance)
        for action in actions:
            if action.kind == 'select_world':
                self.workspace.world(action.arguments['environment_id'], token)
            if action.kind == 'select_robot':
                from .registry import REGISTRY
                if not any(r['id'] == action.arguments['robot_id'] and r['status'] == 'available'
                           for r in REGISTRY['robots']):
                    raise ValueError('the requested robot has no available controller')
        now = time.time()
        record = AgentRequestResponse(id=str(uuid.uuid4()), utterance=request.utterance,
                                      status='planned' if actions else 'needs_clarification',
                                      explanation=explanation, actions=actions,
                                      world_id=request.world_id, expected_revision=request.expected_revision,
                                      created_unix_s=now, updated_unix_s=now).model_dump()
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT fingerprint,payload FROM agent_requests WHERE owner=? AND key=?',
                               (owner(token), key)).fetchone()
            if prior:
                if prior[0] != fingerprint:
                    from .runtime import Conflict
                    raise Conflict('idempotency key was reused for a different request')
                return json.loads(prior[1])
            if db.execute('SELECT COUNT(*) FROM agent_requests WHERE owner=? AND json_extract(payload,"$.created_unix_s")>?',
                          (owner(token), now-86400)).fetchone()[0] >= 60:
                raise ValueError('daily voice and text request limit reached')
            db.execute('INSERT INTO agent_requests VALUES(?,?,?,?,?)',
                       (record['id'], owner(token), key, fingerprint, encode(record)))
        return record

    def get(self, identifier: str, token: str) -> dict:
        return self._get(identifier, token)

    def outcome(self, identifier: str, index: int, outcome: AgentStepOutcome, token: str,
                session_token: str | None = None) -> dict:
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            record = self._get(identifier, token, db)
            if record['status'] not in ('planned', 'running') or index < 0 or index >= len(record['actions']):
                raise ValueError('this action is not pending')
            if any(step['status'] != 'completed' for step in record['actions'][:index]):
                raise ValueError('actions must finish in spoken order')
            step = record['actions'][index]
            if step['status'] != 'pending':
                raise ValueError('this action already has a result')
            if outcome.world_id:
                self.workspace.runtime.supervisor.authorize_world(outcome.world_id, session_token)
                world = self.workspace.runtime.get_world(outcome.world_id)
                if outcome.world_revision != world['revision']:
                    raise ValueError('reported world revision does not match the runtime')
            if outcome.experiment_id:
                experiment = self.workspace.runtime.get_experiment(outcome.experiment_id)
                self.workspace.runtime.supervisor.authorize_world(experiment['world_id'], session_token)
            if outcome.design_id:
                row = db.execute('SELECT 1 FROM viva_robot_designs WHERE id=? AND owner=?',
                                 (outcome.design_id, owner(token))).fetchone()
                if row is None:
                    raise ValueError('design does not belong to this workspace')
            step.update(status='completed' if outcome.success else 'failed', outcome=outcome.message,
                        evidence=outcome.model_dump(exclude_none=True))
            record['status'] = 'failed' if not outcome.success else ('completed' if index == len(record['actions'])-1 else 'running')
            record['updated_unix_s'] = time.time()
            self._save(record, token, db)
            return record

    def cancel(self, identifier: str, token: str) -> dict:
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            record = self._get(identifier, token, db)
            if record['status'] in ('planned', 'running'):
                for step in record['actions']:
                    if step['status'] == 'pending':
                        step['status'] = 'cancelled'
                record.update(status='cancelled', updated_unix_s=time.time())
                self._save(record, token, db)
            return record
