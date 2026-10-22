#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TEST AI LOCAL — Module Phân tích & Giám sát Hệ thống (Analytics Engine)
Ghi nhận số lượng người dùng qua mã QR / Link, tốc độ nhả token, thời gian hoạt động.
Lưu trữ bằng SQLite độc lập, bảo mật cao.
"""
import os
import re
import sqlite3
import time
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "analytics.db")

ADMIN_PIN = os.environ.get("ADMIN_PIN", "")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ip TEXT,
                source TEXT,
                device TEXT,
                browser TEXT,
                path TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ip TEXT,
                source TEXT,
                device TEXT,
                model TEXT,
                mode TEXT,
                prompt_tokens INTEGER DEFAULT 0,
                eval_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                duration_sec REAL DEFAULT 0,
                tok_per_sec REAL DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ip TEXT,
                source TEXT,
                device TEXT,
                action_type TEXT,
                title TEXT,
                details TEXT
            )
        """)
        conn.commit()


# Khởi tạo bảng ngay khi import
init_db()


def is_ignored_traffic(request):
    """Lọc bỏ các lượt ping tự động (Keep-Alive của Tunnel), bot kiểm tra sức khỏe và script kiểm thử."""
    ua = request.headers.get("User-Agent", "")
    if request.headers.get("X-KeepAlive") == "true":
        return True
    if "Tunnel-KeepAlive" in ua or "KeepAlive" in ua:
        return True
    if "python-requests" in ua.lower() or "aiohttp" in ua.lower():
        return True
    return False


def parse_client_info(request):
    """Trích xuất địa chỉ IP thực, thiết bị và nguồn truy cập (Mã QR / Cloudflare / LAN)."""
    # Lọc ping
    is_ignored = is_ignored_traffic(request)

    # IP thực (xử lý proxy Cloudflare hoặc Nginx)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        cf_ip = request.headers.get("CF-Connecting-IP")
        ip = cf_ip if cf_ip else request.remote_addr or "127.0.0.1"

    # Nhận diện nguồn truy cập (Source)
    # Nếu URL có tham số ?src=qr hoặc referer chứa qr -> Quét mã QR
    src_param = request.args.get("src", "").lower()
    ref = request.headers.get("Referer", "").lower()
    host = request.headers.get("Host", "").lower()

    if src_param == "qr" or "src=qr" in ref:
        source = "Mã QR (Camera Phone)"
    elif "trycloudflare.com" in host or "cloudflare" in host:
        source = "Cloudflare Tunnel (Từ xa)"
    elif ip.startswith("192.168.") or ip.startswith("10.") or ip.startswith("172."):
        source = "Wi-Fi Nội bộ (LAN)"
    elif ip in ("127.0.0.1", "localhost", "::1"):
        source = "Máy chủ (Localhost)"
    else:
        source = "Trực tiếp"

    # Nhận diện thiết bị (Device) & Trình duyệt qua User-Agent
    ua = request.headers.get("User-Agent", "")
    device = "Máy tính khác"
    if "iPhone" in ua:
        device = "iPhone"
    elif "iPad" in ua:
        device = "iPad"
    elif "Android" in ua:
        device = "Điện thoại Android"
    elif "Windows" in ua:
        device = "Windows PC"
    elif "Macintosh" in ua or "Mac OS" in ua:
        device = "MacBook / Mac"
    elif "Linux" in ua:
        device = "Linux"

    browser = "Trình duyệt khác"
    if "Zalo" in ua:
        browser = "Zalo In-app"
    elif "FBAN" in ua or "FBAV" in ua:
        browser = "Facebook In-app"
    elif "Edg/" in ua:
        browser = "Microsoft Edge"
    elif "Chrome/" in ua and "Edg/" not in ua:
        browser = "Google Chrome"
    elif "Safari/" in ua and "Chrome/" not in ua:
        browser = "Apple Safari"
    elif "Firefox/" in ua:
        browser = "Firefox"

    return {
        "ip": ip,
        "source": source,
        "device": device,
        "browser": browser,
        "user_agent": ua,
        "is_ignored": is_ignored,
    }


def record_visit(info: dict, path: str = "/"):
    """Ghi nhận lượt truy cập của người dùng thực."""
    if not info or info.get("is_ignored"):
        return
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO visits (ip, source, device, browser, path) VALUES (?, ?, ?, ?, ?)",
                (info["ip"], info["source"], info["device"], info["browser"], path)
            )
            conn.commit()
    except Exception as e:
        print("[Analytics] Lỗi ghi nhận visit:", e)


def record_chat(info: dict, model: str, mode: str, prompt_tokens: int, eval_tokens: int, duration_sec: float, tok_per_sec: float):
    """Ghi nhận phiên hỏi đáp AI, số token và tốc độ nhả chữ của GPU."""
    try:
        total_tokens = prompt_tokens + eval_tokens
        with get_db() as conn:
            conn.execute("""
                INSERT INTO chat_logs 
                (ip, source, device, model, mode, prompt_tokens, eval_tokens, total_tokens, duration_sec, tok_per_sec)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                info["ip"], info["source"], info["device"],
                model, mode, prompt_tokens, eval_tokens, total_tokens,
                round(duration_sec, 2), round(tok_per_sec, 1)
            ))
            conn.commit()
    except Exception as e:
        print("[Analytics] Lỗi ghi nhận chat:", e)


def record_activity(info: dict, action_type: str, title: str, details: str = ""):
    """Ghi nhận nhật ký hoạt động: đính kèm file, hỏi đáp, chạy code sandbox."""
    if not info or info.get("is_ignored"):
        return
    try:
        with get_db() as conn:
            conn.execute("""
                INSERT INTO activity_logs (ip, source, device, action_type, title, details)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                info.get("ip", "127.0.0.1"),
                info.get("source", "Trực tiếp"),
                info.get("device", "Thiết bị khác"),
                action_type,
                title,
                details
            ))
            conn.commit()
    except Exception as e:
        print("[Analytics] Lỗi ghi nhận activity:", e)


def get_dashboard_data():
    """Tổng hợp toàn bộ chỉ số KPI và dữ liệu phân tích biểu đồ cho Dashboard."""
    try:
        with get_db() as conn:
            # 1. Tổng quan lượt truy cập
            total_visits = conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0]
            unique_ips = conn.execute("SELECT COUNT(DISTINCT ip) FROM visits").fetchone()[0]
            qr_visits = conn.execute("SELECT COUNT(*) FROM visits WHERE source LIKE '%Mã QR%'").fetchone()[0]

            # 2. Tổng quan chat và Token
            chat_stats = conn.execute("""
                SELECT 
                    COUNT(*) as total_chats,
                    COALESCE(SUM(total_tokens), 0) as grand_tokens,
                    COALESCE(SUM(eval_tokens), 0) as out_tokens,
                    COALESCE(SUM(prompt_tokens), 0) as in_tokens,
                    COALESCE(AVG(tok_per_sec), 0) as avg_speed,
                    COALESCE(MAX(tok_per_sec), 0) as max_speed,
                    COALESCE(SUM(duration_sec), 0) as total_duration
                FROM chat_logs
            """).fetchone()

            total_chats = chat_stats["total_chats"]
            grand_tokens = chat_stats["grand_tokens"]
            avg_speed = round(chat_stats["avg_speed"], 1)
            max_speed = round(chat_stats["max_speed"], 1)
            total_duration_sec = round(chat_stats["total_duration"], 1)

            # Quy đổi thời gian hoạt động sang giờ:phút:giây
            m, s = divmod(int(total_duration_sec), 60)
            h, m = divmod(m, 60)
            duration_formatted = f"{h}h {m}m {s}s" if h > 0 else f"{m}m {s}s"

            # 3. Phân bổ nguồn truy cập (Source breakdown)
            sources = [dict(row) for row in conn.execute("""
                SELECT source, COUNT(*) as count, COUNT(DISTINCT ip) as unique_ips 
                FROM visits 
                GROUP BY source 
                ORDER BY count DESC
            """).fetchall()]

            # 4. Phân bổ thiết bị (Device breakdown)
            devices = [dict(row) for row in conn.execute("""
                SELECT device, COUNT(*) as count, COUNT(DISTINCT ip) as unique_ips 
                FROM visits 
                GROUP BY device 
                ORDER BY count DESC
            """).fetchall()]

            # 5. Phân bổ theo Model AI đã dùng
            models_usage = [dict(row) for row in conn.execute("""
                SELECT model, COUNT(*) as count, ROUND(AVG(tok_per_sec), 1) as avg_speed, SUM(total_tokens) as tokens
                FROM chat_logs 
                GROUP BY model 
                ORDER BY count DESC
            """).fetchall()]

            # 6. Nhật ký 40 phiên hỏi đáp gần nhất
            recent_chats = [dict(row) for row in conn.execute("""
                SELECT 
                    id, 
                    strftime('%H:%M:%S %d/%m', timestamp, 'localtime') as time_str,
                    ip, 
                    source, 
                    device, 
                    model, 
                    mode, 
                    total_tokens, 
                    duration_sec, 
                    tok_per_sec
                FROM chat_logs 
                ORDER BY id DESC 
                LIMIT 40
            """).fetchall()]

            # 7. Nhật ký 20 lượt truy cập mới nhất
            recent_visits = [dict(row) for row in conn.execute("""
                SELECT 
                    id, 
                    strftime('%H:%M:%S %d/%m', timestamp, 'localtime') as time_str,
                    ip, 
                    source, 
                    device, 
                    browser, 
                    path
                FROM visits 
                ORDER BY id DESC 
                LIMIT 20
            """).fetchall()]

            # 8. Nhật ký hoạt động chi tiết (Đính kèm file, Hỏi đáp AI, Chạy Code Sandbox)
            recent_activities = [dict(row) for row in conn.execute("""
                SELECT 
                    id, 
                    strftime('%H:%M:%S %d/%m', timestamp, 'localtime') as time_str,
                    ip, 
                    source, 
                    device, 
                    action_type, 
                    title, 
                    details
                FROM activity_logs 
                ORDER BY id DESC 
                LIMIT 50
            """).fetchall()]

            # Ước tính số tiền tiết kiệm so với dùng API OpenAI ($0.03 / 1k tokens)
            money_saved_vnd = int(grand_tokens * (0.015 / 1000) * 25400)

            return {
                "success": True,
                "kpis": {
                    "total_visits": total_visits,
                    "unique_ips": unique_ips,
                    "qr_visits": qr_visits,
                    "total_chats": total_chats,
                    "grand_tokens": grand_tokens,
                    "avg_speed": avg_speed,
                    "max_speed": max_speed,
                    "total_duration": duration_formatted,
                    "total_duration_sec": total_duration_sec,
                    "money_saved_vnd": f"{money_saved_vnd:,} đ",
                },
                "sources": sources,
                "devices": devices,
                "models": models_usage,
                "recent_chats": recent_chats,
                "recent_visits": recent_visits,
                "recent_activities": recent_activities,
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


def clear_analytics():
    """Xóa trắng thống kê (chỉ admin có quyền)."""
    with get_db() as conn:
        conn.execute("DELETE FROM visits")
        conn.execute("DELETE FROM chat_logs")
        conn.execute("DELETE FROM activity_logs")
        conn.commit()
    return True
