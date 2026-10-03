"""Local authoritative metrics plus optional SwanLab online synchronization."""
import json,os
from pathlib import Path
from .replay import atomic_json
class Tracker:
    def __init__(self,output,config,mode='disabled',project='patchwork-alphazero',name=None,key=None):
        self.output=Path(output);self.step=0;self.run=None;self.sdk=None
        if mode!='disabled':
            import swanlab
            self.sdk=swanlab
            if mode=='online':
                credential=key or os.environ.get('SWANLAB_API_KEY')
                if not credential:raise ValueError('online mode requires SWANLAB_API_KEY or secure prompt')
                if not swanlab.login(api_key=credential,save=False):raise RuntimeError('SwanLab authentication failed')
            self.run=swanlab.init(project=project,name=name,public=False,config=config,mode=mode,log_dir=str(self.output/'swanlab'))
            atomic_json(self.output/'swanlab.json',{'project':project,'run_id':self.run.id,'url':self.run.url,'mode':mode})
    def log(self,metrics):
        self.step+=1
        with (self.output/'metrics.jsonl').open('a') as f:f.write(json.dumps({'step':self.step,**metrics})+'\n')
        if self.run:self.sdk.log(metrics,step=self.step)
    def finish(self,failed=False):
        if self.run:self.run.finish(state='crashed' if failed else 'success')

    def source_snapshot(self,files,root):
        import hashlib,zipfile
        manifest={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
        atomic_json(self.output/'source-manifest.json',manifest)
        with zipfile.ZipFile(self.output/'source.zip','w',zipfile.ZIP_DEFLATED) as archive:
            for p in files:archive.write(p,str(p.relative_to(root)))
        if self.run:
            text='\n\n'.join('FILE: '+str(p.relative_to(root))+'\n'+p.read_text() for p in files)
            self.run.log_text(key='code/source_snapshot',data=text,caption='Explicit research source snapshot; no credentials or environment variables')
