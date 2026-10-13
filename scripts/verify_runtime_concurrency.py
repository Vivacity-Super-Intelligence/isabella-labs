"""Exercise the hosted HTTP boundary with concurrent reads and queued MuJoCo jobs.

Requests are concurrent. Physics execution remains the configured single worker;
this script explicitly records measured queue time rather than claiming parallel CPU work.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import time
import httpx


def verify(base,output):
    started=time.perf_counter()
    with httpx.Client(base_url=base,timeout=90) as client:
        def request(method,path,body=None):
            response=client.request(method,path,json=body)
            response.raise_for_status()
            return response.json()
        worlds=[request('POST','/v1/worlds',{'backend':'mujoco','seed':seed,'config':{
            'task':'pick_place','obstacle_enabled':False,'cube_position':[.5,y,.026],
            'placement_position':[.5,.18,.026],'cube_half_size':.025}}) for seed,y in [(71,-.15),(72,-.2)]]
        with ThreadPoolExecutor(max_workers=2) as pool:
            submitted=list(pool.map(lambda world:request('POST',f"/v1/worlds/{world['id']}/experiments",{
                'physics_trials':3,'search_candidates':3,'execute_selected':True,'max_simulation_seconds':40}),worlds))
        assert len({e['id'] for e in submitted})==2
        deadline=time.monotonic()+600
        finished={}
        read_batches=[]
        paths=['/health',*[f"/v1/experiments/{e['id']}" for e in submitted],*[f"/v1/worlds/{w['id']}/state" for w in worlds]]
        while len(finished)<2:
            assert time.monotonic()<deadline,'hosted verification deadline exceeded'
            batch_start=time.perf_counter()
            with ThreadPoolExecutor(max_workers=len(paths)) as pool:
                values=list(pool.map(lambda path:request('GET',path),paths))
            assert values[0]['status']=='ok'
            read_batches.append({'request_count':len(paths),'wall_seconds':time.perf_counter()-batch_start,
                'experiment_statuses':[value['status'] for value in values[1:3]]})
            for e in values[1:3]:
                if e['status'] not in ('queued','running'):
                    assert e['status']=='completed',e.get('error')
                    finished[e['id']]=e
            time.sleep(1)
        measurements=[]
        for e in submitted:
            final=finished[e['id']]
            branches=request('GET',f"/v1/experiments/{e['id']}/branches")
            assert len(branches)==4  # three independent validations and a fresh selected execution
            assert all(b['performance']['simulation_steps']>0 for b in branches)
            assert final['result']['execution_evaluation']['success']
            assert len({b['id'] for b in branches})==4
            assert all(b['parent_state_reference'].startswith(final['world_id']+':') for b in branches)
            measurements.append({'experiment_id':e['id'],'world_id':final['world_id'],
                'validation_count':3,'branch_count':len(branches),'performance':final['performance'],
                'evaluations':[b['evaluation'] for b in branches]})
        assert all(e['performance']['peak_parallel_trials']==2 for e in measurements)
        result={'base_url':base,'http_requests_concurrent':True,'experiment_workers':1,
            'physics_trial_workers':2,'physics_parallel':True,'experiments':measurements,'concurrent_read_batches':read_batches,
            'wall_seconds':time.perf_counter()-started}
        output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'experiments':len(measurements),'validation_trials':6,'fresh_executions':2,
            'concurrent_http_requests':sum(b['request_count'] for b in read_batches),'wall_seconds':result['wall_seconds']}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--base',default='https://demo.tryvivacity.com/runtime')
    parser.add_argument('--output',type=Path,default=Path('artifacts/runtime-concurrency-live.json'))
    args=parser.parse_args();verify(args.base,args.output)
