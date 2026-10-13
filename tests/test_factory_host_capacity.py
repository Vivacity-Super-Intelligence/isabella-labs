"""Run this file inside Docker --memory=512m --memory-swap=512m."""
import time
from fastapi.testclient import TestClient
from vivacity.api import create_app

def test_factory_camera_three_cartons_history_and_report_with_host_limit(tmp_path,monkeypatch):
    monkeypatch.setenv('VIVACITY_HEADLESS_GEOMETRY','1')
    headers={'X-Workspace-Token':'factory-host-memory-capability-0123456789'}
    with TestClient(create_app(tmp_path/'host.sqlite3')) as c:
        cell=c.post('/v1/factory/cells',headers=headers,json={'realtime_speed':8}).json()
        camera=c.get('/v1/factory/cells/'+cell['id']+'/observation',headers=headers)
        assert camera.status_code==200,camera.text[:300]
        assert camera.json()['camera']['image_data_url'].startswith('data:image/png;base64,')
        run=c.post('/v1/factory/cells/'+cell['id']+'/runs',headers=headers,json={'mode':'production'}).json()
        deadline=time.monotonic()+180
        while time.monotonic()<deadline:
            row=c.get('/v1/factory/runs/'+run['id'],headers=headers).json()
            assert c.get('/health').status_code==200
            if row['status'] not in ('queued','running','paused'):break
            time.sleep(.3)
        assert row['status']=='completed' and row['metrics']['cartons_sorted']==3,row
        assert c.get('/v1/factory/runs',headers=headers).status_code==200
        assert len(c.get('/v1/factory/runs/'+run['id']+'/samples?limit=50',headers=headers).json()['frames'])==50
        report=c.get('/v1/factory/reports/run/'+run['id'],headers=headers)
        assert report.status_code==200,report.text[:300]
        assert report.content.startswith(b'%PDF')
        assert c.get('/v1/factory/cells/'+cell['id']+'/observation',headers=headers).status_code==200
        from pathlib import Path
        if Path('/proc/self/status').exists():
            print([line for line in Path('/proc/self/status').read_text().splitlines() if line.startswith(('VmRSS:','VmHWM:'))])
