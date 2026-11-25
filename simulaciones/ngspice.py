"""Mínimo envoltorio ctypes para el ngspice.dll que trae KiCad 10 (no hace falta
instalar ngspice aparte).

    from ngspice import run
    vecs = run(deck_text, ["time", "v(out)"])   # -> {nombre: numpy array}
"""
import ctypes as C
import os

import numpy as np

KICAD_BIN = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "KiCad", "10.0", "bin")
_lib = None
_log = []


class _VecInfo(C.Structure):
    _fields_ = [("vname", C.c_char_p), ("vtype", C.c_int), ("vflags", C.c_short),
                ("vrealdata", C.POINTER(C.c_double)), ("vcompdata", C.c_void_p),
                ("vlength", C.c_int)]


_SendChar = C.CFUNCTYPE(C.c_int, C.c_char_p, C.c_int, C.c_void_p)
_SendStat = C.CFUNCTYPE(C.c_int, C.c_char_p, C.c_int, C.c_void_p)
_Exit = C.CFUNCTYPE(C.c_int, C.c_int, C.c_bool, C.c_bool, C.c_int, C.c_void_p)
_Data = C.CFUNCTYPE(C.c_int, C.c_void_p, C.c_int, C.c_int, C.c_void_p)
_InitData = C.CFUNCTYPE(C.c_int, C.c_void_p, C.c_int, C.c_void_p)
_BGRun = C.CFUNCTYPE(C.c_int, C.c_bool, C.c_int, C.c_void_p)


def _on_char(s, i, p):
    _log.append(s.decode(errors="replace"))
    return 0


_cbs = (_SendChar(_on_char), _SendStat(lambda s, i, p: 0),
        _Exit(lambda *a: 0), _Data(lambda *a: 0), _InitData(lambda *a: 0), _BGRun(lambda *a: 0))


def _load():
    global _lib
    if _lib is None:
        os.add_dll_directory(KICAD_BIN)
        _lib = C.CDLL(os.path.join(KICAD_BIN, "ngspice.dll"))
        _lib.ngGet_Vec_Info.restype = C.POINTER(_VecInfo)
        _lib.ngSpice_Init(_cbs[0], _cbs[1], _cbs[2], _cbs[3], _cbs[4], _cbs[5], None)
    return _lib


def run(deck, vectors):
    lib = _load()
    _log.clear()
    lines = [l for l in deck.strip().splitlines()] + [".end"]
    arr = (C.c_char_p * (len(lines) + 1))(*[l.encode() for l in lines], None)
    lib.ngSpice_Command(b"destroy all")
    lib.ngSpice_Circ(arr)
    lib.ngSpice_Command(b"run")
    out = {}
    for v in vectors:
        p = lib.ngGet_Vec_Info(v.encode())
        if not p:
            raise RuntimeError(f"vector {v} not found\n" + "".join(_log[-30:]))
        n = p.contents.vlength
        if p.contents.vrealdata:
            out[v] = np.ctypeslib.as_array(p.contents.vrealdata, shape=(n,)).copy()
        else:   # vector complejo (análisis AC): pares (re, im)
            raw = C.cast(p.contents.vcompdata, C.POINTER(C.c_double))
            a = np.ctypeslib.as_array(raw, shape=(2 * n,)).copy()
            out[v] = a[0::2] + 1j * a[1::2]
    return out


def log():
    return "".join(_log)
