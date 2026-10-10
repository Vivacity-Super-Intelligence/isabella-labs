import numpy as np
import pytest
from vivacity.cloth import ClothBackend
from vivacity.schemas import ClothConfig,CreateWorld,ExperimentRequest


def setup():
    b=ClothBackend();w=b.create_world(ClothConfig().model_dump(),7)
    return b,w


def action():
    return {'kind':'clamp_fold','planning_feasible':True,'lift_height':.2,'motion_seconds':3.,'lateral_offset':0.}


def test_cloth_load_snapshot_fork_and_real_deformation():
    b,w=setup();state=b.snapshot(w);a=b.fork(state);other=b.fork(state)
    assert a.data is not other.data
    assert b.snapshot(a)==state
    assert a.model.nflex==1 and len(b.observe(a)['vertices'])==49
    b.apply_action(a,action());result=b.simulate(a,{'max_simulation_seconds':25})
    assert result['simulation_steps']>=2500 and len(result['trace'])>90
    assert not np.allclose(result['trace'][0]['vertices'],result['trace'][-1]['vertices'])
    assert b.snapshot(other)==state==b.snapshot(w)
    e=b.evaluate(a,result)
    assert e['success'] and e['grasp_valid'] and e['alignment_error_m']<.015
    assert e['vertex_coverage']>=.9
    replay=b.replay({'id':'test','trace':result['trace'],'evaluation':e})
    assert replay['frames']==result['trace'] and not any(replay['frames'][-1]['grasp_active'])
    again=b.fork(state);b.apply_action(again,action());repeated=b.simulate(again,{'max_simulation_seconds':25})
    assert repeated['trace']==result['trace']
    assert b.snapshot(again)==b.snapshot(a)


def test_cloth_timeout_and_missing_clamps_are_failures():
    b,w=setup();b.apply_action(w,action());r=b.simulate(w,{'max_simulation_seconds':.1})
    assert r['failure']=='timeout' and not b.evaluate(w,r)['success']
    b,w=setup();w.data.eq_active[w.grasp_ids]=0;b.apply_action(w,action())
    r=b.simulate(w,{'max_simulation_seconds':25})
    assert r['failure']=='planning_failure' and not b.evaluate(w,r)['success']
    assert not b.evaluate(w,r)['grasp_valid']
    with pytest.raises(ValueError):b.apply_action(w,action()|{'lift_height':float('nan')})


def test_cloth_5000_actual_screening_physics_export_and_revision(runtime):
    w=runtime.create_world(CreateWorld(backend='cloth'))
    e=runtime.submit(w['id'],ExperimentRequest(search_candidates=5000,physics_budget=6))
    done=runtime.wait(e['id'],timeout=180)
    assert done['status']=='completed',done
    search=done['result']['search'];branches=runtime.store.branches(e['id'])
    assert search['generated']==search['distinct_generated']==search['screened']==5000
    assert search['rejected']+search['screening_passed']==5000
    assert search['fully_simulated']==len(branches)==6
    assert search['verified_feasible']>=3
    assert len(done['result']['top_feasible_branch_ids'])==3
    assert all(b['initial_state']==w['initial_state'] for b in branches)
    assert runtime.snapshot(w['id'])==w['initial_state']
    export=runtime.export_branch(e['id'],done['selected_branch_id'])
    assert export['world_type']=='constrained_single_fold' and export['simulation_backend']=='mujoco'
    assert 'mjSTATE_INTEGRATION' in export['state_encoding']
    b,world=setup();first,_,s=b.search(world,{'search_candidates':5000,'physics_budget':6},lambda _:None)
    again,_,t=b.search(world,{'search_candidates':5000,'physics_budget':6},lambda _:None)
    assert first==again and s==t
    runtime.environment(w['id'],ClothConfig(side_length=.45))
    assert runtime.replay(e['id'])['stale']
    assert runtime.snapshot(w['id'])['model_hash']!=w['initial_state']['model_hash']
