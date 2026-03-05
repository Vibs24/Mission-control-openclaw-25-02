from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

_core_path = Path(__file__).resolve().parents[1] / "app.py"
_spec = spec_from_file_location("teamflow_core_app", _core_path)
_module = module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_module)

create_app = _module.create_app
