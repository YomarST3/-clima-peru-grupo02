from __future__ import annotations
import asyncio
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, EmailVerificationCode
from app.models.weather_record import WeatherRecord
from app.schemas.auth import (
    UserResponse,
    UpdateUserRoleRequest,
    UpdateUserPermissionsRequest,
    UpdateUserProfileRequest,
    MessageResponse,
)
from app.services.auth_service import require_admin, hash_password
from app.services.csv_parser import parse_weather_csv
from app.services.dataset_loader import (
    build_city_lookup,
    resolve_city,
    upsert_weather_records,
)

router = APIRouter(prefix="/admin", tags=["Administración"])

# Log persistente para diagnóstico de la ingesta del dataset
_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
try:
    _LOG_DIR.mkdir(exist_ok=True)
except OSError:
    _LOG_DIR = Path(tempfile.gettempdir()) / "clima_peru_logs"
    _LOG_DIR.mkdir(exist_ok=True)

IMPORT_LOGGER = logging.getLogger("dataset.import")
if not IMPORT_LOGGER.handlers:
    try:
        _hdl = logging.FileHandler(_LOG_DIR / "import.log", encoding="utf-8")
    except OSError:
        _hdl = logging.NullHandler()
    _hdl.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    IMPORT_LOGGER.addHandler(_hdl)
    IMPORT_LOGGER.setLevel(logging.INFO)


@router.get("/users", response_model=List[UserResponse])
def list_users(
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [UserResponse.model_validate(u) for u in users]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    payload: UpdateUserRoleRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Rol inválido. Use 'admin' o 'user'.")

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Evitar que un admin se autodegrade y quede el sistema sin admin
    if target.id == current_admin.id and payload.role != "admin":
        raise HTTPException(
            status_code=400,
            detail="No puedes cambiar tu propio rol de administrador.",
        )

    target.role = payload.role
    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)


@router.patch("/users/{user_id}/permissions", response_model=UserResponse)
def update_user_permissions(
    user_id: int,
    payload: UpdateUserPermissionsRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Un admin siempre conserva acceso total; solo editar permisos a no-admin
    if target.is_admin:
        target.role = "admin" if target.is_admin else "user"
        db.commit()
        db.refresh(target)
        return UserResponse.model_validate(target)

    target.perm_dashboard = payload.perm_dashboard
    target.perm_map = payload.perm_map
    target.perm_compare = payload.perm_compare
    target.perm_analysis = payload.perm_analysis
    target.perm_alerts = payload.perm_alerts
    target.perm_rankings = payload.perm_rankings
    target.perm_csv = payload.perm_csv

    if payload.role in ("admin", "user"):
        # Promover a admin: concede todo; degradar un admin ya no es posible aquí
        target.role = payload.role

    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)


@router.patch("/users/{user_id}/profile", response_model=UserResponse)
def update_user_profile(
    user_id: int,
    payload: UpdateUserProfileRequest,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Email único: impedir duplicados con otro usuario
    if payload.email.lower() != target.email.lower():
        exists = (
            db.query(User)
            .filter(User.email.ilike(payload.email), User.id != target.id)
            .first()
        )
        if exists:
            raise HTTPException(
                status_code=400, detail="Ya existe un usuario con ese correo."
            )
        # Al cambiar el email, el usuario debe volver a verificar su cuenta
        target.email = payload.email
        target.is_verified = False

    target.full_name = payload.full_name

    # Si se provee una nueva contraseña, hashearla y guardarla
    if payload.password:
        target.hashed_password = hash_password(payload.password)

    db.commit()
    db.refresh(target)
    return UserResponse.model_validate(target)


@router.delete("/users/{user_id}", response_model=MessageResponse)
def delete_user(
    user_id: int,
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # No permitir eliminarse a sí mismo
    if target.id == current_admin.id:
        raise HTTPException(
            status_code=400,
            detail="No puedes eliminar tu propia cuenta de administrador.",
        )

    # No permitir eliminar el último admin (evitar sistema sin administradores)
    if target.role == "admin":
        admin_count = db.query(User).filter(User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="No se puede eliminar al último administrador del sistema.",
            )

    # Limpiar registros asociados (códigos de verificación por email)
    db.query(EmailVerificationCode).filter(
        EmailVerificationCode.email == target.email
    ).delete(synchronize_session=False)

    db.delete(target)
    db.commit()
    return MessageResponse(message="Usuario eliminado correctamente.")


@router.post("/dataset/import")
async def import_weather_dataset(
    file: UploadFile = File(..., description="Archivo CSV con los datos reales del dataset"),
    current_admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Ingesta el dataset real del CSV a la tabla weather_records (upsert en lotes).

    Normaliza las estaciones del archivo a las ciudades del sistema usando el
    departamento como pista. Los registros sin fecha válida o sin ciudad
    coincidente se omiten y se reportan en 'skipped'.
    """
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="El archivo subido debe tener extensión .csv")

    try:
        content_bytes = await file.read()
        if not content_bytes:
            raise HTTPException(status_code=400, detail="El archivo CSV está vacío.")

        parsed_rows, stats = await asyncio.to_thread(parse_weather_csv, content_bytes, file.filename)
        if not parsed_rows:
            raise HTTPException(status_code=400, detail="No se pudieron extraer filas de datos válidas del archivo CSV.")

        records: List[WeatherRecord] = []
        skipped_dates: int = 0
        deduplicated_rows: int = 0
        unmatched_stations = set()
        mapped_by_province: int = 0
        mapped_by_capital: int = 0
        seen_keys: set = set()

        by_name, by_dept, by_province = build_city_lookup(db)

        for row in parsed_rows:
            city, method = resolve_city(
                row["city"],
                row["department"],
                by_name,
                by_dept,
                by_province,
                row.get("province"),
            )
            if city is None:
                unmatched_stations.add(f'{row["city"]} ({row["department"]})'.strip())
                continue

            if method == "province":
                mapped_by_province += 1
            elif method == "capital_fallback":
                mapped_by_capital += 1

            try:
                record_date = datetime.strptime(str(row["date"]), "%Y-%m-%d").date()
            except ValueError:
                skipped_dates += 1
                continue

            hour_val = row.get("hour") if row.get("hour") is not None else 0
            key = (city.id, record_date, hour_val)
            if key in seen_keys:
                # Varias provincias/estaciones colapsan a la misma ciudad con la
                # misma fecha+hora; Postgres no admite dos filas del mismo batch
                # apuntando a la misma clave en un ON CONFLICT DO UPDATE.
                deduplicated_rows += 1
                continue
            seen_keys.add(key)

            records.append(
                WeatherRecord(
                    city_id=city.id,
                    record_date=record_date,
                    hour=hour_val,
                    temperature=row.get("temperature"),
                    temp_min=row.get("temp_min"),
                    temp_max=row.get("temp_max"),
                    humidity=row.get("humidity"),
                    precipitation=row.get("precipitation") or 0.0,
                    wind_speed=row.get("wind_speed"),
                    uv_index=row.get("uv_index"),
                    condition=(row.get("condition") or "Reporte Cargado")[:200],
                    source="csv",
                )
            )

        if not records:
            raise HTTPException(
                status_code=400,
                detail="No se pudo vincular ningún registro a una ciudad conocida del sistema. "
                "Verifica que el CSV incluya una columna de departamento (y de estación o provincia).",
            )

        affected, _ = upsert_weather_records(db, records)
        IMPORT_LOGGER.info(
            "Import OK file=%s rows=%d unique=%d dedup=%d affected=%d unmatched=%d skipped_dates=%d",
            file.filename,
            stats["total_records"],
            len(records),
            deduplicated_rows,
            affected,
            len(unmatched_stations),
            skipped_dates,
        )
    except HTTPException:
        raise
    except Exception as exc:
        IMPORT_LOGGER.exception("Error importando dataset %s: %s", file.filename, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error interno durante el import del dataset: {exc}",
        ) from exc

    dedupe_note = f" ({deduplicated_rows} filas duplicadas deduplicadas)" if deduplicated_rows else ""
    return {
        "success": True,
        "message": f"Se guardaron {affected} registros reales en la base de datos{dedupe_note}.",
        "file": file.filename,
        "imported_records": len(records),
        "affected_rows": affected,
        "total_in_file": stats["total_records"],
        "deduplicated_rows": deduplicated_rows,
        "skipped_dates": skipped_dates,
        "mapped_by_province": mapped_by_province,
        "mapped_by_capital_fallback": mapped_by_capital,
        "unmatched_stations": sorted(unmatched_stations),
    }
