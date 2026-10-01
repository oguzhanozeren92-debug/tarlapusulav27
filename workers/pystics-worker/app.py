from __future__ import annotations

import json
import os
import platform
from importlib import metadata
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

SERVICE_VERSION = "14.8"
TARGET_PYSTICS_VERSION = "1.2.5"
CALIBRATION_ROOT = Path(os.getenv("PYSTICS_CALIBRATION_ROOT", "/app/calibration")).resolve()
PROFILE_FILE = CALIBRATION_ROOT / "profiles.json"

app = FastAPI(title="TarlaPusula pySTICS Worker", version=SERVICE_VERSION)


def _pystics_version() -> str | None:
    try:
        return metadata.version("pystics")
    except metadata.PackageNotFoundError:
        return None


def _runtime_available() -> bool:
    version = _pystics_version()
    if version != TARGET_PYSTICS_VERSION:
        return False
    try:
        from pystics.simulation import run_pystics_simulation  # noqa: F401
        from pystics.params import parametrization_from_stics_example_files  # noqa: F401
        return True
    except Exception:
        return False


def _profiles() -> list[dict[str, Any]]:
    try:
        raw = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
        profiles = raw.get("profiles", [])
        return profiles if isinstance(profiles, list) else []
    except Exception:
        return []


def _validated_tr_wheat_profiles() -> list[dict[str, Any]]:
    return [
        p
        for p in _profiles()
        if p.get("status") == "validated"
        and p.get("country") == "TR"
        and p.get("crop") == "common_wheat"
        and p.get("approved_for_shadow") is True
    ]


def _safe_child(relative_path: str) -> Path:
    candidate = (CALIBRATION_ROOT / relative_path).resolve()
    if CALIBRATION_ROOT not in candidate.parents and candidate != CALIBRATION_ROOT:
        raise HTTPException(status_code=400, detail="Kalibrasyon dosya yolu güvenli kökün dışında.")
    if not candidate.exists():
        raise HTTPException(status_code=409, detail=f"Kalibrasyon dosyası bulunamadı: {relative_path}")
    return candidate


def _profile(profile_id: str) -> dict[str, Any]:
    for profile in _validated_tr_wheat_profiles():
        if str(profile.get("id")) == profile_id:
            return profile
    raise HTTPException(
        status_code=409,
        detail="Doğrulanmış Türkiye common_wheat kalibrasyon profili bulunamadı.",
    )


class SmokeTestRequest(BaseModel):
    confirm_non_production: bool = False


class WeatherRow(BaseModel):
    doy: int = Field(ge=1, le=366)
    temp_min: float
    temp_max: float
    trg: float = Field(ge=0)
    trr: float = Field(ge=0)
    co2: float = Field(gt=0)
    year: int | None = None
    month: int | None = Field(default=None, ge=1, le=12)
    day: int | None = Field(default=None, ge=1, le=31)


class CalibratedRunRequest(BaseModel):
    field_id: str = Field(min_length=1, max_length=160)
    crop: Literal["common_wheat"]
    calibration_profile_id: str = Field(min_length=1, max_length=160)
    weather: list[WeatherRow] = Field(min_length=30, max_length=730)
    purpose: Literal["shadow_validation"]


@app.get("/health")
def health() -> dict[str, Any]:
    version = _pystics_version()
    validated = _validated_tr_wheat_profiles()
    return {
        "ok": True,
        "service": "tarlapusula-pystics-worker",
        "service_version": SERVICE_VERSION,
        "runtime": {
            "available": _runtime_available(),
            "package_version": version,
            "target_package_version": TARGET_PYSTICS_VERSION,
            "python_version": platform.python_version(),
        },
        "capabilities": {
            "smoke_test": _runtime_available(),
            "calibrated_simulation": _runtime_available(),
            "fertilizer_prescription": False,
            "numeric_n_dose": False,
        },
        "calibration": {
            "profiles_total": len(_profiles()),
            "validated_turkey_wheat_profile_ids": [str(p.get("id")) for p in validated],
        },
        "production_authority": False,
        "authority_note": "soil-nutrition-engine remains TarlaPusula nutrition production authority",
    }


@app.post("/v1/pystics/smoke-test")
def smoke_test(request: SmokeTestRequest) -> dict[str, Any]:
    if request.confirm_non_production is not True:
        raise HTTPException(status_code=400, detail="Smoke-test yalnız non-production onayıyla çalışır.")
    if not _runtime_available():
        raise HTTPException(status_code=503, detail="pySTICS 1.2.5 runtime hazır değil.")

    from pystics.params import parametrization_from_stics_example_files
    from pystics.simulation import run_pystics_simulation

    # Upstream library example. This is NOT a Turkey calibration profile.
    weather, crop, manage, soil, station, constants, initial = (
        parametrization_from_stics_example_files("common_wheat", "Talent")
    )
    outputs, _ = run_pystics_simulation(
        weather, crop, soil, constants, manage, station, initial
    )
    max_reference_yield = None
    if "mafruit_rec" in outputs.columns:
        value = pd.to_numeric(outputs["mafruit_rec"], errors="coerce").max()
        max_reference_yield = float(value) if pd.notna(value) else None

    return {
        "ok": True,
        "mode": "upstream_example_smoke_test",
        "reference_only": True,
        "species": "common_wheat",
        "variety": "Talent",
        "rows": int(len(outputs)),
        "reference_example_max_mafruit_rec_t_ha": max_reference_yield,
        "production_authority": False,
        "turkey_calibration": False,
        "guardrails": [
            "Talent example is only a runtime smoke-test",
            "do not use this output as a TarlaPusula field prediction",
            "do not derive fertilizer or numeric nitrogen dose",
        ],
    }


@app.post("/v1/pystics/simulate-calibrated")
def simulate_calibrated(request: CalibratedRunRequest) -> dict[str, Any]:
    if not _runtime_available():
        raise HTTPException(status_code=503, detail="pySTICS 1.2.5 runtime hazır değil.")
    profile = _profile(request.calibration_profile_id)
    files = profile.get("files") or {}
    required = ["crop_xml", "soil_xml", "initial_xml", "station_xml", "manage_xml"]
    missing = [key for key in required if not files.get(key)]
    if missing:
        raise HTTPException(status_code=409, detail=f"Kalibrasyon profil dosyaları eksik: {', '.join(missing)}")

    from pystics.params import (
        Constants,
        CropParams,
        InitialParams,
        ManageParams,
        SoilParams,
        StationParams,
    )
    from pystics.simulation import run_pystics_simulation

    crop = CropParams(
        species="common_wheat",
        variety=str(profile.get("variety") or ""),
        file_path=str(_safe_child(str(files["crop_xml"]))),
    )
    soil = SoilParams(
        source="xml_file",
        file_path=str(_safe_child(str(files["soil_xml"]))),
        soil_name=str(profile.get("soil_name") or ""),
    )
    initial = InitialParams(
        file_path=str(_safe_child(str(files["initial_xml"]))),
        hinitf_unit=str(profile.get("hinitf_unit") or "%"),
    )
    station = StationParams(file_path=str(_safe_child(str(files["station_xml"]))))
    manage = ManageParams(file_path=str(_safe_child(str(files["manage_xml"]))))
    constants = Constants()

    weather = pd.DataFrame([row.model_dump() for row in request.weather])
    required_weather = ["doy", "temp_min", "temp_max", "trg", "trr", "co2"]
    if weather[required_weather].isna().any().any():
        raise HTTPException(status_code=400, detail="Weather girdilerinde boş zorunlu alan var.")

    outputs, _ = run_pystics_simulation(
        weather, crop, soil, constants, manage, station, initial
    )

    def metric(column: str, method: str = "max") -> float | None:
        if column not in outputs.columns:
            return None
        series = pd.to_numeric(outputs[column], errors="coerce")
        if method == "last":
            series = series.dropna()
            value = series.iloc[-1] if len(series) else None
        else:
            value = getattr(series, method)()
        return float(value) if value is not None and pd.notna(value) else None

    # Shadow crop-model evidence only. No N dose / fertilizer prescription output.
    return {
        "ok": True,
        "mode": "calibrated_shadow_simulation",
        "production_authority": False,
        "field_id": request.field_id,
        "profile_id": request.calibration_profile_id,
        "crop": request.crop,
        "outputs": {
            "days": int(len(outputs)),
            "max_lai": metric("lai"),
            "max_mafruit_rec_t_ha": metric("mafruit_rec"),
            "final_masec_t_ha": metric("masec", "last"),
        },
        "guardrails": [
            "shadow crop-model evidence only",
            "soil-nutrition-engine remains production nutrition authority",
            "no fertilizer prescription",
            "no numeric nitrogen dose",
            "field/lab validation remains required",
        ],
    }
