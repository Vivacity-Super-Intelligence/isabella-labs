"""Reuse immutable compiled geometry while every fork owns independent MjData.

Weak references retain no model after its last active world is released. Model
configuration is changed only by compiling a new world, never during stepping.
This avoids compiling several copies of Panda meshes for a single experiment.
"""
from copy import copy, deepcopy
import os
from dataclasses import fields
from threading import RLock
from weakref import WeakValueDictionary

import mujoco as mj

_worlds = WeakValueDictionary()
_lock = RLock()


def remember(world, backend):
    if os.getenv('VIVACITY_IMMUTABLE_MODEL_FORKS') != '1':
        return world
    with _lock:
        _worlds[(backend, mj.__version__, world.model_hash)] = world
    return world


def fork_geometry(state):
    if os.getenv('VIVACITY_IMMUTABLE_MODEL_FORKS') != '1':
        return None
    with _lock:
        parent = _worlds.get((state['backend'], state['version'], state['model_hash']))
    if parent is None:
        return None
    child = copy(parent)
    for field in fields(parent):
        if field.name not in ('model', 'data'):
            setattr(child, field.name, deepcopy(getattr(parent, field.name)))
    child.data = mj.MjData(parent.model)
    child.config = deepcopy(state['config'])
    child.seed = state['seed']
    child.action = {}
    return child
