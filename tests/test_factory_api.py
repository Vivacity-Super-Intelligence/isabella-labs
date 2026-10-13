import time
from fastapi.testclient import TestClient
from vivacity.api import create_app

OWNER={'X-Workspace-Token':'factory-owner-capability-123456789000'}
OTHER={'X-Workspace-Token':'factory-other-capability-123456789000'}

def wait(client,identifier,statuses):
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        row=client.get('/v1/factory/runs/'+identifier,headers=OWNER).json()
        if row['status'] in statuses:return row
        time.sleep(.03)
    raise AssertionError(row)

def test_transport_controls_ownership_and_persistence(tmp_path):
    path=tmp_path/'factory.sqlite3'
    with TestClient(create_app(path)) as c:
        assert c.post('/v1/factory/cells',json={}).status_code==422
        assert c.post('/v1/factory/cells',headers=OWNER,json={'conveyor_speed_m_s':1}).status_code==422
        cell=c.post('/v1/factory/cells',headers=OWNER,json={'realtime_speed':8,'carton_count':1}).json()
        assert cell['frame']['time']==0
        assert c.get('/v1/factory/cells/'+cell['id'],headers=OTHER).status_code==404
        response=c.post('/v1/factory/cells/'+cell['id']+'/runs',headers=OWNER,json={})
        assert response.status_code==202
        identifier=response.json()['id'];control='/v1/factory/runs/'+identifier+'/control'
        assert c.post(control,headers=OTHER,json={'action':'stop'}).status_code==404
        assert c.post(control,headers=OWNER,json={'action':'pause'}).status_code==200
        paused=wait(c,identifier,{'paused'})
        time.sleep(.08)
        assert c.get('/v1/factory/runs/'+identifier,headers=OWNER).json()['frame']['time']==paused['frame']['time']
        c.post(control,headers=OWNER,json={'action':'resume'})
        row=wait(c,identifier,{'completed','failed'})
        assert row['status']=='completed',row
        assert row['metrics']['station_arrivals']==1
        record=c.get('/v1/factory/runs/'+identifier+'/record',headers=OWNER).json()
        times=[f['time'] for f in record['trace']]
        assert times==sorted(set(times)) and len(times)>10
        assert record['initial_state']!=record['final_state']
        assert record['events'][-1]['kind']=='station_arrival'
    with TestClient(create_app(path)) as c:
        assert c.get('/v1/factory/runs/'+identifier+'/record',headers=OWNER).json()==record

def test_emergency_stop_and_fresh_cell_reset(tmp_path):
    with TestClient(create_app(tmp_path/'factory.sqlite3')) as c:
        cell=c.post('/v1/factory/cells',headers=OWNER,json={}).json()
        run=c.post('/v1/factory/cells/'+cell['id']+'/runs',headers=OWNER,json={}).json()
        c.post('/v1/factory/runs/'+run['id']+'/control',headers=OWNER,json={'action':'emergency_stop'})
        row=wait(c,run['id'],{'emergency_stopped'})
        time.sleep(.06)
        assert c.get('/v1/factory/runs/'+run['id'],headers=OWNER).json()['frame']['time']==row['frame']['time']
        reset=c.post('/v1/factory/cells',headers=OWNER,json=cell['config']).json()
        assert reset['initial_state']==cell['initial_state'] and reset['frame']['time']==0
