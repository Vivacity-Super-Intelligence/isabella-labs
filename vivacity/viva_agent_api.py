"""Public, versioned agent transport. Action outcomes remain client-reported audits."""
from typing import Annotated
from typing import Literal

from fastapi import APIRouter, Header, Request, Response
from pydantic import Field

from .schemas import Schema

from .viva_agent import AgentTurnRequest, AgentStepOutcome, AgentRequestResponse
from .robot_design import RobotDesignRequest, RobotDesignResponse


Token = Annotated[str, Header(alias='X-Workspace-Token', min_length=32, max_length=128,
                              pattern=r'^[A-Za-z0-9_-]+$')]
Key = Annotated[str, Header(alias='Idempotency-Key', min_length=8, max_length=128,
                            pattern=r'^[A-Za-z0-9_-]+$')]
router = APIRouter(prefix='/v1/agent', tags=['Viva workspace agent'])


@router.post('/robot-designs', response_model=RobotDesignResponse, status_code=201)
def create_robot_design(body: RobotDesignRequest, request: Request, x_workspace_token: Token,
                        idempotency_key: Annotated[str | None, Header(alias='Idempotency-Key', min_length=8, max_length=128,
                                                                   pattern=r'^[A-Za-z0-9_-]+$')] = None):
    return request.app.state.robot_designs.create(body, x_workspace_token, idempotency_key,
                                                  request.client.host if request.client else '')


@router.get('/robot-designs/{identifier}', response_model=RobotDesignResponse)
def robot_design(identifier: str, request: Request, x_workspace_token: Token):
    return request.app.state.robot_designs.get(identifier, x_workspace_token)


@router.get('/robot-designs/{identifier}/model.mjcf', response_class=Response)
def robot_model(identifier: str, request: Request, x_workspace_token: Token):
    return Response(request.app.state.robot_designs.xml(identifier, x_workspace_token), media_type='application/xml',
                    headers={'Content-Disposition': f'attachment; filename="vivacity-design-{identifier}.mjcf"'})


class VoiceCapabilitiesResponse(Schema):
    schema_version: Literal['vivacity.voice-capabilities/1.0'] = 'vivacity.voice-capabilities/1.0'
    available: bool
    reason: str | None
    max_session_seconds: int = Field(ge=1, le=180)


@router.get('/voice/capabilities', response_model=VoiceCapabilitiesResponse)
def voice_capabilities(request: Request, x_workspace_token: Token):
    configured = request.app.state.viva_voice.configured()
    return {'schema_version': 'vivacity.voice-capabilities/1.0', 'available': configured,
            'reason': None if configured else 'A dedicated voice API project with an enforced $5 monthly limit is not configured. Typed commands work now.',
            'max_session_seconds': 180}


class VoiceSessionResponse(Schema):
    schema_version: Literal['vivacity.voice-session/1.0'] = 'vivacity.voice-session/1.0'
    id: str
    client_secret: str
    expires_at: int
    max_seconds: int = Field(ge=1, le=180)


@router.post('/voice/sessions', response_model=VoiceSessionResponse, status_code=201)
def create_voice(request: Request, x_workspace_token: Token):
    return request.app.state.viva_voice.create(x_workspace_token, request.client.host if request.client else '')


class VoiceStopResponse(Schema):
    schema_version: Literal['vivacity.voice-stop/1.0'] = 'vivacity.voice-stop/1.0'
    id: str
    status: Literal['closed'] = 'closed'


@router.post('/voice/sessions/{identifier}/stop', response_model=VoiceStopResponse)
def stop_voice(identifier: str, request: Request, x_workspace_token: Token):
    return request.app.state.viva_voice.stop(identifier, x_workspace_token)


@router.post('/requests', response_model=AgentRequestResponse, status_code=201)
def submit(body: AgentTurnRequest, request: Request, x_workspace_token: Token,
           idempotency_key: Key, x_session_token: Annotated[str | None, Header(alias='X-Session-Token')] = None):
    return request.app.state.viva_agent.create(body, x_workspace_token, idempotency_key, x_session_token)


@router.get('/requests/{identifier}', response_model=AgentRequestResponse)
def get(identifier: str, request: Request, x_workspace_token: Token):
    return request.app.state.viva_agent.get(identifier, x_workspace_token)


@router.post('/requests/{identifier}/steps/{index}/outcome', response_model=AgentRequestResponse)
def outcome(identifier: str, index: int, body: AgentStepOutcome, request: Request,
            x_workspace_token: Token,
            x_session_token: Annotated[str | None, Header(alias='X-Session-Token')] = None):
    return request.app.state.viva_agent.outcome(identifier, index, body, x_workspace_token, x_session_token)


@router.post('/requests/{identifier}/cancel', response_model=AgentRequestResponse)
def cancel(identifier: str, request: Request, x_workspace_token: Token):
    return request.app.state.viva_agent.cancel(identifier, x_workspace_token)
