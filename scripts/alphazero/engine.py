"""ctypes wrapper around the exact production C++ rules (not its search)."""
import ctypes as C
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[2]
class State(C.Structure):
    _fields_=[('boards',C.c_uint64*4),*((n,C.c_int32*2) for n in ('buttons','income','time','bonus')),('circle',C.c_int32*33),*((n,C.c_int32) for n in ('size','token','current','pending','claimed','bonusOwner','firstFinished','over'))]
    def clone(self):return State.from_buffer_copy(bytes(self))
    def to_dict(self):return {n:list(getattr(self,n)) if isinstance(getattr(self,n),C.Array) else int(getattr(self,n)) for n,_ in self._fields_}
    @classmethod
    def from_dict(cls,d):
        s=cls()
        for n,_ in cls._fields_:
            field=getattr(s,n)
            if isinstance(field,C.Array):field[:]=d[n]
            else:setattr(s,n,d[n])
        return s
class Action(C.Structure):
    _fields_=[('low',C.c_uint64),('high',C.c_uint64),*((n,C.c_int32) for n in ('type','piece','orientation','x','y'))]
    @property
    def mask(self):return int(self.low)|(int(self.high)<<64)
    def key(self):return tuple(int(getattr(self,n)) for n,_ in self._fields_)
class Engine:
    def __init__(self,library=None,contact=False):
        self.contact=contact
        path=Path(library or ROOT/'.build/alphazero/engine.dylib');path.parent.mkdir(parents=True,exist_ok=True)
        sources=[ROOT/'cpp'/n for n in ('alphazero-engine.cpp','engine.hpp','data.hpp','search.hpp','research.hpp')]+list((ROOT/'cpp/model').glob('*'))
        optional=ROOT/'cpp/seven-square-planning.hpp'
        if optional.exists():sources.append(optional)
        if not path.exists() or max(p.stat().st_mtime for p in sources)>path.stat().st_mtime:
            subprocess.run(['c++','-std=c++17','-O3','-shared','-fPIC',str(sources[0]),'-o',str(path)],check=True)
        self.lib=C.CDLL(str(path));pstate=C.POINTER(State);paction=C.POINTER(Action)
        for name,args,ret in [('az_initial',[pstate,C.c_uint32],None),('az_legal',[pstate,paction,C.c_int,C.c_int],C.c_int),('az_apply',[pstate,paction,pstate,C.c_int],C.c_int),('az_winner',[pstate],C.c_int),('az_advanced',[pstate,paction,C.c_int,C.c_uint32,C.POINTER(C.c_int),C.POINTER(C.c_int)],C.c_int)]:
            f=getattr(self.lib,name);f.argtypes=args;f.restype=ret
        assert self.lib.az_state_size()==C.sizeof(State) and self.lib.az_action_size()==C.sizeof(Action)
    def initial(self,seed):
        s=State();self.lib.az_initial(C.byref(s),seed);return s
    def legal(self,s):
        n=self.lib.az_legal(C.byref(s),None,0,self.contact)
        if n<0:raise ValueError('invalid state')
        buf=(Action*n)();assert self.lib.az_legal(C.byref(s),buf,n,self.contact)==n
        return list(buf)
    def apply(self,s,a):
        out=State();code=self.lib.az_apply(C.byref(s),C.byref(a),C.byref(out),self.contact)
        if code:raise ValueError(f'illegal action or state ({code})')
        return out
    def winner(self,s):
        result=self.lib.az_winner(C.byref(s))
        if result<0:raise ValueError('game is not terminal')
        return result

    def advanced(self,s,budget_ms,seed):
        a=Action();simulations=C.c_int();elapsed=C.c_int()
        code=self.lib.az_advanced(C.byref(s),C.byref(a),budget_ms,seed,C.byref(simulations),C.byref(elapsed))
        if code:raise ValueError(f'advanced search failed ({code})')
        return a,{'simulations':simulations.value,'elapsed_ms':elapsed.value,'legal_actions':len(self.legal(s))}
