# -*- coding: utf-8 -*-
"""
TAVO CLOUD ERP — Núcleo de Seguridad y Autenticación (FASE 1)
security_core.py

Módulo criptográfico y transaccional autónomo (Zero External Dependencies).
Utiliza exclusivamente la biblioteca estándar de Python 3.10+.
"""

import os
import time
import json
import base64
import hmac
import hashlib
import secrets
import sqlite3
import logging
from http.cookies import SimpleCookie
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple

_sec_logger = logging.getLogger("tavo.security")
if not _sec_logger.handlers:
    _sh = logging.StreamHandler()
    _sh.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"))
    _sec_logger.addHandler(_sh)
    _sec_logger.setLevel(logging.INFO)

_DEFAULT_JWT_SECRET = "TAVO_CLOUD_SECRET_KEY_DEV_9876543210_SECURE"
_DEFAULT_ENC_KEY = "TAVO_CLOUD_SESSION_ENC_KEY_DEV_123456789"

# Constantes de Seguridad Canónicas
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", _DEFAULT_JWT_SECRET)
SESSION_ENCRYPTION_KEY = os.environ.get("SESSION_ENCRYPTION_KEY", _DEFAULT_ENC_KEY)

if (JWT_SECRET_KEY == _DEFAULT_JWT_SECRET or SESSION_ENCRYPTION_KEY == _DEFAULT_ENC_KEY) and (
    os.environ.get("RENDER") or os.environ.get("TAVO_ENV") == "production"
):
    if os.environ.get("TAVO_STRICT_SECRETS") == "1":
        raise RuntimeError("CONFIGURACIÓN CRÍTICA FALTANTE: Defina JWT_SECRET_KEY y SESSION_ENCRYPTION_KEY en producción.")
    _sec_logger.warning("Claves JWT_SECRET_KEY / SESSION_ENCRYPTION_KEY usan valores por defecto en producción. Configure variables de entorno.")

SESSION_COOKIE_NAME = "tavo_session"

GRACE_WINDOW_SECONDS = 30           # Tolerancia para peticiones en tránsito con token rotado
MAX_SESSION_LIFETIME_SECONDS = 28800 # 8 horas de límite absoluto inviolable
RENEWAL_THRESHOLD_SECONDS = 300     # Rotar si restan menos de 5 minutos (300 segundos)
SESSION_IDLE_TIMEOUT_SECONDS = 1800  # 30 minutos de inactividad
IDEMPOTENCY_TTL_SECONDS = 86400      # 24 horas de retención para respuestas transaccionales

# =============================================================================
# 1. DERIVACIÓN DE CLAVES CRIPTOGRÁFICAS (HKDF RFC 5869 - Pure Python)
# =============================================================================

def hkdf_extract_and_expand(salt: bytes, ikm: bytes, info: bytes, length: int = 64) -> bytes:
    """Deriva claves criptográficamente independientes usando HMAC-SHA256."""
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    okm = b""
    t = b""
    block_num = 1
    while len(okm) < length:
        t = hmac.new(prk, t + info + bytes([block_num]), hashlib.sha256).digest()
        okm += t
        block_num += 1
    return okm[:length]

# Derivar subclaves para cifrado y autenticación de tokens en reposo
_KM = hkdf_extract_and_expand(b"TAVO_ERP_SESSION_SALT_2026", SESSION_ENCRYPTION_KEY.encode(), b"SESSION_ENC_MAC_KEYS", 64)
_ENC_KEY = _KM[:32]
_MAC_KEY = _KM[32:]

# =============================================================================
# 2. CIFRADO EN REPOSO DE TOKENS SUCESORES (AEAD - Encrypt-then-MAC)
# =============================================================================

def cifrar_jwt_sucesor(plaintext: str) -> str:
    """Cifra el token sucesor en reposo con nonce aleatorio de 16 bytes y HMAC-SHA256."""
    nonce = secrets.token_bytes(16)
    pt_bytes = plaintext.encode("utf-8")
    ciphertext = bytearray()
    
    # Modo CTR autenticado
    for block_idx in range((len(pt_bytes) + 31) // 32):
        ctr = block_idx.to_bytes(4, "big")
        ks = hmac.new(_ENC_KEY, nonce + ctr, hashlib.sha256).digest()
        start = block_idx * 32
        end = min(start + 32, len(pt_bytes))
        for i in range(start, end):
            ciphertext.append(pt_bytes[i] ^ ks[i - start])
            
    ciphertext_bytes = bytes(ciphertext)
    tag = hmac.new(_MAC_KEY, nonce + ciphertext_bytes, hashlib.sha256).digest()
    return base64.b64encode(nonce + tag + ciphertext_bytes).decode("ascii")

def descifrar_jwt_sucesor(payload_b64: str) -> str:
    """Descifra el token sucesor verificando la etiqueta de autenticación."""
    data = base64.b64decode(payload_b64.encode("ascii"))
    if len(data) < 48:
        raise ValueError("Payload cifrado corrupto o incompleto")
    nonce = data[:16]
    tag = data[16:48]
    ciphertext_bytes = data[48:]
    
    expected_tag = hmac.new(_MAC_KEY, nonce + ciphertext_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("Violación de integridad: La etiqueta de autenticación no coincide")
        
    plaintext = bytearray()
    for block_idx in range((len(ciphertext_bytes) + 31) // 32):
        ctr = block_idx.to_bytes(4, "big")
        ks = hmac.new(_ENC_KEY, nonce + ctr, hashlib.sha256).digest()
        start = block_idx * 32
        end = min(start + 32, len(ciphertext_bytes))
        for i in range(start, end):
            plaintext.append(ciphertext_bytes[i] ^ ks[i - start])
            
    return bytes(plaintext).decode("utf-8")

# =============================================================================
# 3. GENERACIÓN Y VALIDACIÓN DE TOKENS JWT (HMAC-SHA256)
# =============================================================================

def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")

def b64url_decode(s: str) -> bytes:
    pad = 4 - (len(s) % 4)
    if pad != 4:
        s += "=" * pad
    return base64.urlsafe_b64decode(s.encode("ascii"))

def emitir_jwt(jti: str, usuario_id: int, instance_id: int = 1, root_iat: Optional[int] = None,
               rol: str = "Usuario", perms: Optional[Dict[str, Any]] = None,
               duracion_segundos: int = SESSION_IDLE_TIMEOUT_SECONDS) -> str:
    """Emite un token JWT compacto firmado con HMAC-SHA256."""
    ahora = int(time.time())
    if root_iat is None:
        root_iat = ahora
        
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "jti": jti,
        "uid": usuario_id,
        "iid": instance_id,
        "root_iat": root_iat,
        "iat": ahora,
        "exp": ahora + duracion_segundos,
        "rol": rol,
        "perms": perms or {}
    }
    
    header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(JWT_SECRET_KEY.encode(), signature_input, hashlib.sha256).digest()
    signature_b64 = b64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"

def decodificar_y_verificar_jwt(token_str: str) -> Optional[Dict[str, Any]]:
    """Valida la firma HMAC y expiración de un JWT. Retorna el payload o None."""
    try:
        parts = token_str.strip().split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        
        signature_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(JWT_SECRET_KEY.encode(), signature_input, hashlib.sha256).digest()
        actual_sig = b64url_decode(sig_b64)
        
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
            
        payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))
        ahora = int(time.time())
        if ahora > payload.get("exp", 0):
            return None  # Expirado
            
        return payload
    except Exception:
        return None

# =============================================================================
# 4. REVOCACIÓN RECURSIVA DE FAMILIA MEDIANTE CTE EN SQLITE
# =============================================================================

def ejecutar_revocacion_familia_cte(cursor: sqlite3.Cursor, jti_comprometido: str):
    """Invalida recursivamente todos los ancestros y descendientes del JTI sospechoso."""
    cte_query = """
        WITH RECURSIVE familia_sesiones(jti) AS (
            SELECT jti FROM sesiones_activas WHERE jti = ?
            UNION
            SELECT s.jti FROM sesiones_activas s
            JOIN familia_sesiones f ON s.parent_jti = f.jti
            UNION
            SELECT s.jti FROM sesiones_activas s
            JOIN familia_sesiones f ON s.reemplazado_por_jti = f.jti
        )
        UPDATE sesiones_activas 
        SET estado = 'REVOCADA', encrypted_jwt = NULL
        WHERE jti IN (SELECT jti FROM familia_sesiones)
    """
    cursor.execute(cte_query, (jti_comprometido,))

# =============================================================================
# 5. MOTOR DE SESIONES Y ROTACIÓN ATÓMICA CON REPLAY SEGURO
# =============================================================================

def validar_y_rotar_sesion(conn: sqlite3.Connection, incoming_jwt: str, client_ip: str = "") -> Tuple[Optional[Dict[str, Any]], Optional[str], int]:
    """
    Valida la sesión y ejecuta la rotación atómica si está a menos de 5 min de expirar.
    Garantiza replay seguro mediante descifrado del token sucesor original.
    """
    token_data = decodificar_y_verificar_jwt(incoming_jwt)
    if not token_data:
        return None, "Token de sesión inválido, malformado o firma alterada", 401

    jti = token_data.get("jti")
    usuario_id = token_data.get("uid")
    root_iat = token_data.get("root_iat", token_data.get("iat"))
    rol_nombre = token_data.get("rol", "Usuario")
    perms = token_data.get("perms", {})
    ahora_ts = int(time.time())

    # Invariante 1: Límite absoluto de 8 horas desde el login raíz
    if (ahora_ts - root_iat) > MAX_SESSION_LIFETIME_SECONDS:
        cur = conn.cursor()
        cur.execute("UPDATE sesiones_activas SET estado = 'EXPIRADA', encrypted_jwt = NULL WHERE jti = ?", (jti,))
        if not conn.in_transaction:
            conn.commit()
        return None, "Sesión terminada por límite absoluto de 8 horas. Inicie sesión nuevamente.", 401

    token_hash = hashlib.sha256(incoming_jwt.encode("ascii")).hexdigest()
    cur = conn.cursor()

    # Bloqueo reservado para serializar transacciones concurrentes
    started_tx = False
    if not conn.in_transaction:
        cur.execute("BEGIN IMMEDIATE")
        started_tx = True

    try:
        cur.execute("""
            SELECT s.jti, s.parent_jti, s.reemplazado_por_jti, s.usuario_id, s.instance_id,
                   s.csrf_token, s.expira_en, s.rotada_en, s.estado, s.encrypted_jwt,
                   u.activo as usuario_activo
            FROM sesiones_activas s
            JOIN usuarios u ON s.usuario_id = u.id
            WHERE s.jti = ? AND s.token_hash = ?
        """, (jti, token_hash))
        row = cur.fetchone()

        if not row:
            if started_tx:
                conn.rollback()
            return None, "Sesión no registrada en el sistema de seguridad", 401

        row_dict = {
            "jti": row[0], "parent_jti": row[1], "reemplazado_por_jti": row[2],
            "usuario_id": row[3], "instance_id": row[4], "csrf_token": row[5],
            "expira_en": row[6], "rotada_en": row[7], "estado": row[8],
            "encrypted_jwt": row[9], "usuario_activo": row[10]
        }

        # Invariante 2: Verificación de Usuario Activo en base de datos
        if row_dict["usuario_activo"] != 1:
            cur.execute("UPDATE sesiones_activas SET estado = 'REVOCADA', encrypted_jwt = NULL WHERE usuario_id = ?", (usuario_id,))
            if started_tx:
                conn.commit()
            return None, "Acceso denegado: Usuario suspendido o inactivo", 403

        def _parse_utc_ts(ts_raw: str) -> int:
            s = str(ts_raw or "").strip()
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.astimezone(timezone.utc).timestamp())

        estado = row_dict["estado"]
        expira_en_ts = _parse_utc_ts(row_dict["expira_en"])

        # Invariante 3: Sesiones en estado terminal
        if estado in ("REVOCADA", "EXPIRADA"):
            if started_tx:
                conn.rollback()
            return None, f"Sesión inválida: estado {estado}", 401

        # =====================================================================
        # CAMINO DEL PERDEDOR (REPLAY SEGURO EN VENTANA DE GRACIA <= 30 SEGUNDOS)
        # =====================================================================
        if estado == "ROTADA":
            rotada_ts = _parse_utc_ts(row_dict["rotada_en"])
            delta = ahora_ts - rotada_ts

            if delta > GRACE_WINDOW_SECONDS:
                # Reuso anómalo fuera de gracia: revocación de toda la familia
                ejecutar_revocacion_familia_cte(cur, jti)
                if started_tx:
                    conn.commit()
                return None, "ALERTA DE SEGURIDAD: Token rotado utilizado fuera de la ventana de gracia. Sesión revocada.", 401

            sucesor_jti = row_dict["reemplazado_por_jti"]
            if not sucesor_jti:
                if started_tx:
                    conn.rollback()
                return None, "Inconsistencia de sesión: token rotado sin sucesor registrado", 500

            cur.execute("""
                SELECT jti, usuario_id, instance_id, csrf_token, estado, encrypted_jwt
                FROM sesiones_activas WHERE jti = ?
            """, (sucesor_jti,))
            suc_row = cur.fetchone()

            if not suc_row or suc_row[4] != "ACTIVA":
                ejecutar_revocacion_familia_cte(cur, jti)
                if started_tx:
                    conn.commit()
                return None, "Sucesor de sesión inválido o revocado", 401

            # Descifrar el JWT idéntico generado originalmente por el ganador
            try:
                jwt_autentico = descifrar_jwt_sucesor(suc_row[5])
            except Exception:
                if started_tx:
                    conn.rollback()
                return None, "Error descifrando credencial sucesora", 500

            if started_tx:
                conn.commit()

            return {
                "jti": suc_row[0],
                "usuario_id": row_dict["usuario_id"],
                "instance_id": row_dict["instance_id"],
                "rol": rol_nombre,
                "perms": perms,
                "csrf_token": suc_row[3],
                "nuevo_jwt": jwt_autentico,
                "rotado": True
            }, None, 200

        # =====================================================================
        # INACTIVIDAD SOBRE SESIÓN ACTIVA
        # =====================================================================
        if ahora_ts > expira_en_ts:
            cur.execute("UPDATE sesiones_activas SET estado = 'EXPIRADA', encrypted_jwt = NULL WHERE jti = ?", (jti,))
            if started_tx:
                conn.commit()
            return None, "Sesión expirada por inactividad", 401

        # =====================================================================
        # CAMINO DEL GANADOR (ROTACIÓN ATÓMICA ANTE VENCIMIENTO PRÓXIMO < 5 MIN)
        # =====================================================================
        if (expira_en_ts - ahora_ts) < RENEWAL_THRESHOLD_SECONDS:
            nuevo_jti = secrets.token_hex(32)
            nuevo_csrf = row_dict["csrf_token"] or secrets.token_hex(32)
            nueva_expira = (datetime.now(timezone.utc) + timedelta(seconds=SESSION_IDLE_TIMEOUT_SECONDS)).isoformat()
            
            # Generar nuevo JWT
            nuevo_jwt = emitir_jwt(
                jti=nuevo_jti,
                usuario_id=row_dict["usuario_id"],
                instance_id=row_dict["instance_id"],
                root_iat=root_iat,
                rol=rol_nombre,
                perms=perms,
                duracion_segundos=SESSION_IDLE_TIMEOUT_SECONDS
            )
            nuevo_hash = hashlib.sha256(nuevo_jwt.encode("ascii")).hexdigest()
            encrypted_jwt_payload = cifrar_jwt_sucesor(nuevo_jwt)

            # 1. Insertar sucesor (Hijo)
            cur.execute("""
                INSERT INTO sesiones_activas (
                    jti, token_hash, parent_jti, usuario_id, instance_id, csrf_token,
                    expira_en, estado, ip_origen, encrypted_jwt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVA', ?, ?)
            """, (
                nuevo_jti, nuevo_hash, jti, row_dict["usuario_id"], row_dict["instance_id"],
                nuevo_csrf, nueva_expira, client_ip, encrypted_jwt_payload
            ))

            # 2. Actualizar padre con timestamp explícito UTC ISO-8601
            rotada_en_iso = datetime.now(timezone.utc).isoformat()
            cur.execute("""
                UPDATE sesiones_activas 
                SET estado = 'ROTADA', rotada_en = ?, reemplazado_por_jti = ?
                WHERE jti = ? AND estado = 'ACTIVA'
            """, (rotada_en_iso, nuevo_jti, jti))

            if started_tx:
                conn.commit()

            return {
                "jti": nuevo_jti,
                "usuario_id": row_dict["usuario_id"],
                "instance_id": row_dict["instance_id"],
                "rol": rol_nombre,
                "perms": perms,
                "csrf_token": nuevo_csrf,
                "nuevo_jwt": nuevo_jwt,
                "rotado": True
            }, None, 200

        # Sesión activa sin requerir rotación
        if started_tx:
            conn.commit()

        return {
            "jti": row_dict["jti"],
            "usuario_id": row_dict["usuario_id"],
            "instance_id": row_dict["instance_id"],
            "rol": rol_nombre,
            "perms": perms,
            "csrf_token": row_dict["csrf_token"],
            "nuevo_jwt": None,
            "rotado": False
        }, None, 200

    except Exception as e:
        if started_tx:
            conn.rollback()
        raise e

# =============================================================================
# 6. GESTOR DE IDEMPOTENCIA TRANSACCIONAL FINANCIERA
# =============================================================================

def verificar_y_reservar_idempotencia(conn: sqlite3.Connection, key: str, endpoint: str,
                                      usuario_id: int, request_body_str: str) -> Tuple[str, Optional[Dict[str, Any]]]:
    """
    Verifica si una clave ya fue procesada.
    Retorna: ('NUEVA', None), ('REPLAY', response_dict), o eleva ValueError('CONFLICT_422').
    """
    cur = conn.cursor()
    request_hash = hashlib.sha256(request_body_str.encode("utf-8")).hexdigest()

    cur.execute("""
        SELECT estado, request_hash, response_code, response_body, expira_en
        FROM idempotencia_transaccional WHERE idempotency_key = ?
    """, (key,))
    row = cur.fetchone()

    if row:
        estado, saved_hash, resp_code, resp_body, expira_en = row
        if saved_hash != request_hash:
            raise ValueError("IDEMPOTENCY_PAYLOAD_MISMATCH: La clave ya fue usada con un payload diferente")
        if estado == "COMPLETADO":
            return "REPLAY", {"code": resp_code, "body": json.loads(resp_body) if resp_body else {}}
        if estado == "EN_PROCESO":
            return "EN_PROCESO", None

    # Reservar clave
    expira_en_str = (datetime.now(timezone.utc) + timedelta(seconds=IDEMPOTENCY_TTL_SECONDS)).isoformat()
    cur.execute("""
        INSERT OR REPLACE INTO idempotencia_transaccional (
            idempotency_key, request_hash, endpoint, usuario_id, instance_id, estado, expira_en
        ) VALUES (?, ?, ?, ?, 1, 'EN_PROCESO', ?)
    """, (key, request_hash, endpoint, usuario_id, expira_en_str))

    return "NUEVA", None

def registrar_respuesta_idempotente(conn: sqlite3.Connection, key: str, code: int, body_dict: Dict[str, Any]):
    cur = conn.cursor()
    cur.execute("""
        UPDATE idempotencia_transaccional
        SET estado = 'COMPLETADO', response_code = ?, response_body = ?
        WHERE idempotency_key = ?
    """, (code, json.dumps(body_dict), key))

# =============================================================================
# 7. REGISTRADOR DE EVENTOS OUTBOX (Asynchronous Event Dispatcher)
# =============================================================================

def encolar_evento_outbox(conn: sqlite3.Connection, tipo_evento: str, payload: Dict[str, Any]):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO outbox_eventos (tipo_evento, payload_json, estado)
        VALUES (?, ?, 'PENDIENTE')
    """, (tipo_evento, json.dumps(payload)))

# =============================================================================
# 8. EXTRACCIÓN SEGURA DE CREDENCIAL (BEARER O COOKIE HTTPONLY)
# =============================================================================

def extraer_jwt_de_headers(headers) -> Tuple[Optional[str], Optional[str]]:
    """
    Extrae el JWT desde Authorization: Bearer <jwt> o desde Cookie HttpOnly 'tavo_session'.
    Retorna (token, origen) donde origen es 'bearer' | 'cookie' | None.
    """
    if not headers:
        return None, None
    auth_header = headers.get("Authorization") or headers.get("authorization") or ""
    if auth_header.startswith("Bearer "):
        tok = auth_header.split(" ", 1)[1].strip()
        if tok:
            return tok, "bearer"

    raw_cookie = headers.get("Cookie") or headers.get("cookie") or ""
    if raw_cookie and SESSION_COOKIE_NAME in raw_cookie:
        try:
            jar = SimpleCookie()
            jar.load(raw_cookie)
            if SESSION_COOKIE_NAME in jar:
                val = jar[SESSION_COOKIE_NAME].value.strip()
                if val:
                    return val, "cookie"
        except Exception:
            pass
    return None, None

# =============================================================================
# 9. CONTROL ANTI-FUERZA BRUTA / RATE LIMITING EN LOGIN
# =============================================================================

LOGIN_MAX_INTENTOS = 5
LOGIN_WINDOW_SECONDS = 900      # Ventana de 15 minutos
LOGIN_LOCKOUT_SECONDS = 300     # Bloqueo temporal de 5 minutos

def _asegurar_tabla_rate_limit(cur: sqlite3.Cursor):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS login_intentos (
            clave TEXT PRIMARY KEY,
            intentos INTEGER NOT NULL DEFAULT 0,
            bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
            ultimo_intento INTEGER NOT NULL DEFAULT 0
        )
    """)

def _claves_rate_limit(client_ip: str, username: str):
    claves = []
    if client_ip:
        claves.append(f"ip:{client_ip}")
    if username:
        claves.append(f"usr:{username.strip().lower()}")
    return claves

def verificar_bloqueo_login(conn: sqlite3.Connection, client_ip: str, username: str = "") -> Optional[int]:
    """Retorna segundos restantes de bloqueo si la IP o el usuario excedió intentos fallidos; sino None."""
    ahora = int(time.time())
    cur = conn.cursor()
    _asegurar_tabla_rate_limit(cur)
    max_restante = 0
    for clave in _claves_rate_limit(client_ip, username):
        cur.execute("SELECT bloqueado_hasta FROM login_intentos WHERE clave = ?", (clave,))
        row = cur.fetchone()
        if row and row[0] and int(row[0]) > ahora:
            restante = int(row[0]) - ahora
            if restante > max_restante:
                max_restante = restante
    return max_restante if max_restante > 0 else None

def registrar_intento_fallido_login(conn: sqlite3.Connection, client_ip: str, username: str = "") -> Tuple[int, int]:
    """Registra fallo de autenticación y activa bloqueo temporal al alcanzar LOGIN_MAX_INTENTOS."""
    ahora = int(time.time())
    cur = conn.cursor()
    _asegurar_tabla_rate_limit(cur)
    max_intentos = 0
    bloqueo_seg = 0
    for clave in _claves_rate_limit(client_ip, username):
        cur.execute("SELECT intentos, bloqueado_hasta, ultimo_intento FROM login_intentos WHERE clave = ?", (clave,))
        row = cur.fetchone()
        if row:
            intentos_prev, blq_hasta, ult = int(row[0]), int(row[1]), int(row[2])
            if (ahora - ult) > LOGIN_WINDOW_SECONDS and blq_hasta <= ahora:
                intentos_nuevos = 1
            else:
                intentos_nuevos = intentos_prev + 1
        else:
            intentos_nuevos = 1

        nuevo_blq_hasta = ahora + LOGIN_LOCKOUT_SECONDS if intentos_nuevos >= LOGIN_MAX_INTENTOS else 0
        if nuevo_blq_hasta > ahora:
            bloqueo_seg = max(bloqueo_seg, LOGIN_LOCKOUT_SECONDS)
        max_intentos = max(max_intentos, intentos_nuevos)
        cur.execute("""
            INSERT INTO login_intentos (clave, intentos, bloqueado_hasta, ultimo_intento)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(clave) DO UPDATE SET
                intentos = excluded.intentos,
                bloqueado_hasta = excluded.bloqueado_hasta,
                ultimo_intento = excluded.ultimo_intento
        """, (clave, intentos_nuevos, nuevo_blq_hasta, ahora))
    conn.commit()
    return max_intentos, bloqueo_seg

def limpiar_intentos_login(conn: sqlite3.Connection, client_ip: str, username: str = ""):
    """Restablece el contador de intentos fallidos tras un login válido."""
    cur = conn.cursor()
    _asegurar_tabla_rate_limit(cur)
    for clave in _claves_rate_limit(client_ip, username):
        cur.execute("DELETE FROM login_intentos WHERE clave = ?", (clave,))
    conn.commit()

