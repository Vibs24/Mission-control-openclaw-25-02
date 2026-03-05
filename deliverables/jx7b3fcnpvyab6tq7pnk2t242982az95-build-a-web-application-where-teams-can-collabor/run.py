import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('teamflow_app', Path(__file__).with_name('app.py'))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
create_app = mod.create_app
