from typing import Literal
from fastapi import APIRouter, Request, Query
from pydantic import BaseModel,ConfigDict
from .factory import FactorySettings
from .workspace_api import Token
from .factory_benchmark import BenchmarkRequest

router=APIRouter(prefix='/v1/factory',tags=['Factory production'])

class RunRequest(BaseModel):
    model_config=ConfigDict(extra='forbid')
    mode:Literal['conveyor','production']='conveyor'

class Command(BaseModel):
    model_config=ConfigDict(extra='forbid')
    action:Literal['pause','resume','stop','emergency_stop']

@router.post('/cells',status_code=201)
def create_cell(body:FactorySettings,request:Request,x_workspace_token:Token):
    return request.app.state.factory.create(body.model_dump(),x_workspace_token)

@router.get('/cells/{identifier}')
def cell(identifier:str,request:Request,x_workspace_token:Token):
    return request.app.state.factory.cell(identifier,x_workspace_token)

@router.get('/cells/{identifier}/observation')
def observation(identifier:str,request:Request,x_workspace_token:Token,source:Literal['initial','latest']='latest'):
    return request.app.state.factory.observation(identifier,x_workspace_token,source)

@router.post('/cells/{identifier}/runs',status_code=202)
def start(identifier:str,body:RunRequest,request:Request,x_workspace_token:Token):
    return request.app.state.factory.start(identifier,x_workspace_token,body.mode)

@router.get('/runs/{identifier}')
def run(identifier:str,request:Request,x_workspace_token:Token):
    return request.app.state.factory.get(identifier,x_workspace_token)

@router.get('/runs')
def history(request:Request,x_workspace_token:Token):
    return request.app.state.factory.history(x_workspace_token)

@router.get('/runs/{identifier}/record')
def record(identifier:str,request:Request,x_workspace_token:Token):
    return request.app.state.factory.get(identifier,x_workspace_token,full=True)

@router.get('/runs/{identifier}/samples')
def samples(identifier:str,request:Request,x_workspace_token:Token,after:int=Query(-1,ge=-1),limit:int=Query(400,ge=1,le=1000)):
    return request.app.state.factory.samples(identifier,x_workspace_token,after,limit)

@router.post('/runs/{identifier}/control')
def control(identifier:str,body:Command,request:Request,x_workspace_token:Token):
    return request.app.state.factory.command(identifier,x_workspace_token,body.action)

@router.post('/cells/{identifier}/benchmarks',status_code=202)
def start_benchmark(identifier:str,body:BenchmarkRequest,request:Request,x_workspace_token:Token):
    return request.app.state.factory.start_benchmark(identifier,x_workspace_token,body.model_dump())

@router.get('/benchmarks')
def benchmarks(request:Request,x_workspace_token:Token):
    return request.app.state.factory.benchmarks(x_workspace_token)

@router.get('/benchmarks/{identifier}')
def benchmark(identifier:str,request:Request,x_workspace_token:Token):
    return request.app.state.factory.benchmark(identifier,x_workspace_token)

@router.post('/benchmarks/{identifier}/control')
def benchmark_control(identifier:str,body:Command,request:Request,x_workspace_token:Token):
    return request.app.state.factory.command(identifier,x_workspace_token,body.action,kind='factory_benchmark')
