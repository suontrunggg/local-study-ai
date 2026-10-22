#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Local AI Assistant — chạy hoàn toàn offline qua Ollama.

Yêu cầu:
  - Ollama đã cài và đang chạy (localhost:11434)
  - Model đã tải:  ollama pull qwen2.5:7b  và  ollama pull deepseek-r1:7b
  - Python:  pip install openai

Các "chế độ" tự động hóa có sẵn:
  chat       - trò chuyện trực tiếp
  explain    - giải thích thuật ngữ/khái niệm dạng Flashcard
  summarize  - tóm tắt 1 file văn bản (.txt/.md) thành dàn bài
  classify   - phân loại văn bản vào các nhãn cho trước
  extract    - trích xuất dữ liệu có cấu trúc (JSON) từ văn bản
  list       - liệt kê model đã cài

Ví dụ:
  python assistant.py chat --model qwen2.5:7b
  python assistant.py explain "NPV - net present value"
  python assistant.py explain "Lạm phát kỳ vọng (expected inflation)" --model deepseek-r1:7b
  python assistant.py summarize ghi_chu.txt
  python assistant.py classify "Giá dầu tăng do OPEC cắt sản lượng" --labels "kinh tế vĩ mô,kinh tế vi mô,tài chính,khác"
  python assistant.py extract bill.txt --fields "tổng tiền,ngày,đơn vị tiền tệ"
"""
import argparse
import json
import sys
from pathlib import Path

# Ép UTF-8 cho console Windows để in tiếng Việt không lỗi
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from openai import OpenAI

# Ollama mở API tương thích OpenAI tại đây. api_key có thể là chuỗi bất kỳ.
BASE_URL = "http://localhost:11434/v1"
API_KEY = "local"

# Model mặc định cho từng việc
MODEL_CHAT = "qwen2.5:7b"       # tổng hợp, nhanh, hiểu tiếng Việt
MODEL_REASON = "deepseek-r1:7b"  # suy luận từng bước, mạnh toán/kinh tế lượng


def get_client() -> OpenAI:
    return OpenAI(base_url=BASE_URL, api_key=API_KEY)


def ask(client: OpenAI, model: str, system: str, user: str,
        temperature: float = 0.3, max_tokens: int = 2048) -> str:
    """Gọi model và trả text trả lời (đã bỏ phần 'thinking' nếu model reasoning)."""
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    return resp.choices[0].message.content.strip()


# ---------------------------------------------------------------- commands

def cmd_list(_client: OpenAI):
    import json as _json
    import urllib.request
    with urllib.request.urlopen("http://localhost:11434/api/tags") as r:
        data = _json.load(r)
    print("Model đã cài:")
    for m in data.get("models", []):
        size_gb = m.get("size", 0) / 1e9
        print(f"  - {m['name']:<24} {size_gb:5.2f} GB")


def cmd_chat(client: OpenAI, model: str):
    print(f"== Trò chuyện với {model} (gõ 'exit' để thoát) ==")
    system = "Bạn là trợ lý học tập hữu ích, trả lời bằng tiếng Việt, chính xác và có cấu trúc."
    history = [{"role": "system", "content": system}]
    while True:
        try:
            line = input("\nBạn: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if line.lower() in ("exit", "quit", "q"):
            break
        history.append({"role": "user", "content": line})
        resp = client.chat.completions.create(
            model=model, messages=history, temperature=0.4, max_tokens=2048,
        )
        reply = resp.choices[0].message.content.strip()
        history.append({"role": "assistant", "content": reply})
        print(f"\nAI: {reply}")


def cmd_explain(client: OpenAI, topic: str, model: str, depth: str):
    depth_map = {
        "short": "ngắn gọn: 1 định nghĩa + 1 ví dụ (3-4 câu)",
        "medium": "vừa: định nghĩa, bản chất/ý nghĩa, công thức nếu có, và 1 ví dụ thực tế",
        "deep": "sâu: định nghĩa, bản chất kinh tế/tài chính, công thức & giải thích từng thành phần, ví dụ bằng số, và các lưu ý/hiểu lầm thường gặp",
    }
    system = (
        "Bạn là gia sư chuyên ngành Kinh tế - Tài chính - Kinh tế lượng. "
        "Trả lời bằng tiếng Việt, dạng Flashcard dễ học."
    )
    user = f'Giải thích thuật ngữ/khái niệm sau: "{topic}".\nĐộ sâu: {depth_map.get(depth, depth_map["medium"])}'
    print(ask(client, model, system, user, max_tokens=1500))


def cmd_summarize(client: OpenAI, path: str, model: str, style: str):
    p = Path(path)
    if not p.exists():
        print(f"Lỗi: không tìm thấy file {path}")
        sys.exit(1)
    text = p.read_text(encoding="utf-8", errors="replace")
    styles = {
        "outline": "Tạo dàn bài (bullets có cấp độ) gồm ý chính và ý phụ.",
        "summary": "Viết 1 đoạn tóm tắt súc tích (~150-250 từ).",
        "notes": "Ghi chú dạng học tập: khái niệm quan trọng, công thức, ví dụ.",
    }
    system = "Bạn là trợ lý tóm tắt tài liệu học thuật. Trả lời bằng tiếng Việt."
    user = f"Tóm tắt tài liệu sau theo yêu cầu: {styles.get(style, styles['outline'])}\n\n--- TÀI LIỆU ---\n{text[:8000]}"
    print(ask(client, model, system, user, max_tokens=2000))


def cmd_classify(client: OpenAI, text: str, labels: str, model: str):
    label_list = [l.strip() for l in labels.split(",") if l.strip()]
    system = "Bạn là hệ thống phân loại. Chỉ trả về ĐÚNG MỘT nhãn, không giải thích gì thêm."
    user = f'Phân loại văn bản sau vào MỘT trong các nhãn: {", ".join(label_list)}.\nVăn bản: "{text}"\nTrả về đúng tên nhãn:'
    print(ask(client, model, system, user, temperature=0.0, max_tokens=32))


def cmd_extract(client: OpenAI, path: str, fields: str, model: str):
    p = Path(path)
    if not p.exists():
        print(f"Lỗi: không tìm thấy file {path}")
        sys.exit(1)
    text = p.read_text(encoding="utf-8", errors="replace")
    field_list = [f.strip() for f in fields.split(",") if f.strip()]
    system = (
        "Bạn là công cụ trích xuất dữ liệu. CHỈ trả về JSON thuần (không markdown, không chú thích). "
        "Khóa phải đúng tên field yêu cầu."
    )
    user = (
        f"Trích xuất từ văn bản các trường: {field_list}.\n"
        "Trả về JSON object, nếu thiếu trường thì đặt null.\n\n"
        f"--- VĂN BẢN ---\n{text[:8000]}"
    )
    raw = ask(client, model, system, user, temperature=0.0, max_tokens=800)
    # cố gắng parse JSON sạch
    try:
        start = raw.index("{")
        end = raw.rindex("}") + 1
        parsed = json.loads(raw[start:end])
        print(json.dumps(parsed, ensure_ascii=False, indent=2))
    except (ValueError, json.JSONDecodeError):
        print(raw)


# --------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Local AI Assistant (Ollama)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_chat = sub.add_parser("chat", help="Trò chuyện")
    p_chat.add_argument("--model", default=MODEL_CHAT)

    p_expl = sub.add_parser("explain", help="Giải thích thuật ngữ dạng Flashcard")
    p_expl.add_argument("topic")
    p_expl.add_argument("--model", default=MODEL_CHAT)
    p_expl.add_argument("--depth", choices=["short", "medium", "deep"], default="medium")

    p_sum = sub.add_parser("summarize", help="Tóm tắt file văn bản")
    p_sum.add_argument("path")
    p_sum.add_argument("--model", default=MODEL_CHAT)
    p_sum.add_argument("--style", choices=["outline", "summary", "notes"], default="outline")

    p_cls = sub.add_parser("classify", help="Phân loại văn bản")
    p_cls.add_argument("text")
    p_cls.add_argument("--labels", required=True, help="Các nhãn cách nhau bằng dấu phẩy")
    p_cls.add_argument("--model", default=MODEL_CHAT)

    p_ext = sub.add_parser("extract", help="Trích xuất JSON từ file")
    p_ext.add_argument("path")
    p_ext.add_argument("--fields", required=True, help="Các trường cách nhau bằng dấu phẩy")
    p_ext.add_argument("--model", default=MODEL_CHAT)

    sub.add_parser("list", help="Liệt kê model đã cài")

    args = ap.parse_args()
    client = get_client()

    if args.cmd == "list":
        cmd_list(client)
    elif args.cmd == "chat":
        cmd_chat(client, args.model)
    elif args.cmd == "explain":
        cmd_explain(client, args.topic, args.model, args.depth)
    elif args.cmd == "summarize":
        cmd_summarize(client, args.path, args.model, args.style)
    elif args.cmd == "classify":
        cmd_classify(client, args.text, args.labels, args.model)
    elif args.cmd == "extract":
        cmd_extract(client, args.path, args.fields, args.model)


if __name__ == "__main__":
    main()
