# Local Study AI

Trợ lý học tập chạy local bằng Flask và Ollama, với giao diện chat tiếng Việt, hỏi đáp tài liệu và xuất PowerPoint có thể chỉnh sửa.

## Tính năng

- Chat streaming với các model đã cài trong Ollama.
- Đọc PDF, DOCX, TXT, Markdown và dữ liệu CSV.
- Các chế độ học tập: đọc paper, giải bài tập, ôn thi, flashcard và hỗ trợ code.
- Chuyển nội dung slide thành file `.pptx`, có bố cục và ghi chú thuyết trình.
- Xuất ghi chú Markdown và dashboard thống kê cục bộ.
- Chạy Python tùy chọn cho người dùng local tin cậy; mặc định tắt.

## Chạy trên Windows (Python 3.11+)

1. Cài [Python](https://www.python.org/downloads/) và [Ollama](https://ollama.com/).
2. Tải một model phù hợp máy, ví dụ `ollama pull qwen2.5:7b`. Nếu Ollama chưa chạy, mở `ollama serve` trong terminal riêng.
3. Trong thư mục dự án, chạy PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

Mở http://127.0.0.1:5000. Model weights không đi kèm mã nguồn; Qwen 14B không bắt buộc. Chọn model đã cài trong giao diện.

Linux/macOS: dùng `python3 -m venv .venv`, sau đó `.venv/bin/python -m pip install -r requirements.txt` và `.venv/bin/python server.py`.

## Cấu hình

Đặt biến môi trường trước khi chạy; ứng dụng không tự đọc file `.env`.

```powershell
$env:OLLAMA_HOST = "http://127.0.0.1:11434"
$env:ADMIN_PIN = "your-own-long-random-pin"
```

Dashboard ở `/dashboard`; API quản trị bị khóa nếu chưa đặt `ADMIN_PIN`. Chọn PIN tối đa 16 ký tự theo giao diện hiện tại.

Để chạy code trên máy local tin cậy: cài `requirements-code.txt`, đặt `$env:ENABLE_CODE_EXECUTION = "1"`, rồi khởi động lại. Bộ lọc AST và subprocess không phải môi trường cách ly bảo mật để chạy code của người lạ.

## Dữ liệu và giới hạn

- Thư mục `data/` chứa SQLite analytics (IP, thiết bị và thông tin hoạt động); `sandbox/` chứa file sinh ra. Các thư mục này được tạo khi chạy và không được đưa vào Git.
- Chat với model local không cần API key. Tuy nhiên Google Fonts, KaTeX CDN và dịch vụ QR bên ngoài cần mạng; giao diện chưa hoàn toàn offline. Dịch vụ QR nhận URL chia sẻ khi được dùng.
- Bản phát hành này phục vụ chạy local. Chưa được xác nhận sẵn sàng cho dịch vụ cloud nhiều người dùng. Cần xác thực, giới hạn tài nguyên, quản lý dữ liệu và môi trường chạy code cách ly trước khi cung cấp công khai.
- Kết quả AI có thể sai; cần tự kiểm tra nội dung học thuật và slide.

## Phát triển và đóng góp

Mở issue kèm bước tái hiện, phiên bản Python/Ollama và model đang dùng. Không đưa tài liệu cá nhân, database, PIN hay khóa API vào issue. Xem [CONTRIBUTING.md](CONTRIBUTING.md) và [SECURITY.md](SECURITY.md).

Đây là bản công khai đầu tiên của dự án cá nhân có sử dụng AI hỗ trợ phát triển. Không kèm model weights, lịch sử người dùng hay tài liệu cá nhân. Xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) về các thành phần bên thứ ba.

License: MIT cho phần mã do dự án sở hữu; các thành phần bên thứ ba giữ license gốc.
