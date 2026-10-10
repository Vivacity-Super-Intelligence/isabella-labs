from contextlib import asynccontextmanager
from typing import Annotated
import asyncio
import os
from fastapi import FastAPI, Header, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .runtime import Runtime, Conflict, Busy, Unavailable
from .schemas import CreateWorld, ExperimentRequest, EnvironmentPatch, CommitRequest, WorldResponse, ExperimentResponse, BranchResponse, StateResponse, ReplayResponse, EventResponse, BranchExport
from .schemas import ImportResponse,ImportPreview
from .imports import ImportService,MAX_UPLOAD
from pathlib import Path


def create_app(database=None):
    @asynccontextmanager
    async def lifespan(app):
        path=database or os.getenv('VIVACITY_DATABASE', 'data/vivacity.sqlite3')
        app.state.runtime = Runtime(path)
        app.state.imports = ImportService(Path(path).parent/'imports')
        yield
        await asyncio.to_thread(app.state.runtime.close)

    app = FastAPI(title='Vivacity Execution Runtime', version='1.0.0', lifespan=lifespan, description='Measured Panda reaching, constrained flex folding and restricted 2D orbital hypothesis comparison. Bounded data-only imports. Single-process demo.')
    origins = [o.strip() for o in os.getenv('VIVACITY_CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['GET', 'POST', 'PATCH'], allow_headers=['Content-Type', 'Idempotency-Key'])

    @app.exception_handler(KeyError)
    async def missing(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=404, content={'detail': 'record not found'})

    @app.exception_handler(Conflict)
    async def conflict(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=409, content={'detail': str(exc)})

    @app.exception_handler(Busy)
    async def busy(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=429, content={'detail': str(exc)}, headers={'Retry-After': '5'})

    @app.exception_handler(ValueError)
    async def invalid(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=422, content={'detail': str(exc)})

    @app.exception_handler(Unavailable)
    async def unavailable(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content={'detail': str(exc)}, headers={'Retry-After': '5'})

    @app.get('/health')
    def health():
        return {'status': 'ok', 'schema_version': '1.0', 'backends': {k: b.version for k, b in app.state.runtime.backends.items()}}

    @app.post('/v1/imports',response_model=ImportResponse,status_code=201)
    async def import_world(request:Request,filename:str=Query(min_length=1,max_length=180)):
        chunks=[];length=0
        async for chunk in request.stream():
            length+=len(chunk)
            if length>MAX_UPLOAD:raise ValueError('upload exceeds 16 MiB')
            chunks.append(chunk)
        return await asyncio.to_thread(app.state.imports.create,filename,b''.join(chunks))

    @app.get('/v1/imports/{import_id}',response_model=ImportResponse)
    def imported_world(import_id:str):return app.state.imports.get(import_id)

    @app.get('/v1/imports/{import_id}/preview',response_model=ImportPreview)
    def import_preview(import_id:str):return app.state.imports.get(import_id,preview=True)

    @app.post('/v1/worlds', response_model=WorldResponse, status_code=201)
    def create_world(request: CreateWorld):
        return app.state.runtime.create_world(request)

    @app.get('/v1/worlds/{world_id}', response_model=WorldResponse)
    def get_world(world_id: str):
        return app.state.runtime.get_world(world_id)

    @app.get('/v1/worlds/{world_id}/state', response_model=StateResponse)
    def state(world_id: str):
        return app.state.runtime.observe(world_id)

    @app.post('/v1/worlds/{world_id}/experiments', response_model=ExperimentResponse, status_code=202)
    def experiment(world_id: str, request: ExperimentRequest, idempotency_key: Annotated[str | None, Header(min_length=1, max_length=128, pattern=r'^[A-Za-z0-9._:-]+$')] = None):
        return app.state.runtime.submit(world_id, request, idempotency_key)

    @app.get('/v1/experiments/{experiment_id}', response_model=ExperimentResponse)
    def get_experiment(experiment_id: str):
        return app.state.runtime.get_experiment(experiment_id)

    @app.get('/v1/experiments/{experiment_id}/branches', response_model=list[BranchResponse])
    def branches(experiment_id: str):
        app.state.runtime.get_experiment(experiment_id)
        return app.state.runtime.store.branches(experiment_id)

    @app.get('/v1/experiments/{experiment_id}/events', response_model=list[EventResponse])
    def recorded_events(experiment_id: str, after: int = Query(0, ge=0)):
        app.state.runtime.get_experiment(experiment_id)
        return app.state.runtime.store.events(experiment_id, after)

    @app.get('/v1/experiments/{experiment_id}/branches/{branch_id}/export', response_model=BranchExport)
    def export_branch(experiment_id: str, branch_id: str):
        from fastapi.responses import JSONResponse
        result=BranchExport.model_validate(app.state.runtime.export_branch(experiment_id,branch_id))
        return JSONResponse(result.model_dump(),headers={'Content-Disposition':f'attachment; filename="vivacity-{result.branch_id}.json"'})

    @app.post('/v1/worlds/{world_id}/commit', response_model=WorldResponse)
    def commit(world_id: str, request: CommitRequest):
        return app.state.runtime.commit(world_id, request.experiment_id, request.branch_id)

    @app.post('/v1/worlds/{world_id}/reset', response_model=WorldResponse)
    def reset(world_id: str):
        return app.state.runtime.reset(world_id)

    @app.patch('/v1/worlds/{world_id}/environment', response_model=WorldResponse)
    def environment(world_id: str, request: EnvironmentPatch):
        return app.state.runtime.environment(world_id, request.config)

    @app.get('/v1/experiments/{experiment_id}/replay', response_model=ReplayResponse)
    def replay(experiment_id: str):
        return app.state.runtime.replay(experiment_id)

    @app.websocket('/v1/experiments/{experiment_id}/events')
    async def events(websocket: WebSocket, experiment_id: str, after: int = Query(0, ge=0)):
        # Same origin policy for browser clients, independent of HTTP CORS middleware.
        origin = websocket.headers.get('origin')
        if origin and origin not in origins:
            await websocket.close(code=1008); return
        try:
            app.state.runtime.get_experiment(experiment_id)
        except KeyError:
            await websocket.close(code=1008); return
        await websocket.accept()
        try:
            while True:
                # Read terminal status first, then drain its atomically persisted event.
                status = await asyncio.to_thread(app.state.runtime.get_experiment, experiment_id)
                batch = await asyncio.to_thread(app.state.runtime.store.events, experiment_id, after)
                for event in batch:
                    await websocket.send_json(EventResponse.model_validate(event).model_dump())
                    after = event['seq']
                    if event['kind'] in ('completed', 'failed'):
                        await websocket.close(code=1000); return
                if not batch and status['status'] in ('completed', 'failed'):
                    await websocket.close(code=1000); return
                await asyncio.sleep(0.1)
        except WebSocketDisconnect:
            return

    from fastapi.openapi.utils import get_openapi

    def openapi():
        if app.openapi_schema is None:
            spec = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
            spec['x-websockets'] = {'/v1/experiments/{experiment_id}/events': {'description': 'Persisted progress; reconnect with after=<seq>; closes on terminal event.', 'message_schema': EventResponse.model_json_schema()}}
            app.openapi_schema = spec
        return app.openapi_schema

    app.openapi = openapi
    return app


app = create_app()
