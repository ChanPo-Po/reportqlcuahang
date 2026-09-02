# POPOPHONE STORE MANAGEMENT — Production Starter

## Có gì trong source
- `frontend/`: deploy lên Netlify.
- `apps-script/Code.gs`: API thật + phân quyền backend.
- `apps-script/appsscript.json`: timezone Việt Nam.
- Không có nút chuyển quyền ở giao diện thật.
- QL đăng nhập chỉ được gọi API của MANAGER.
- CEO đăng nhập mới gọi được API CEO.
- Dù QL sửa JavaScript hoặc gọi API trực tiếp, backend vẫn trả `Bạn không có quyền truy cập chức năng này`.

## 1. Tạo Google Sheet
Tạo 1 file Google Sheets mới, lấy Spreadsheet ID trên URL.

Mở Apps Script gắn với project hoặc standalone, dán `Code.gs`.
Trong `CFG.SPREADSHEET_ID`, thay:
`PASTE_SPREADSHEET_ID_HERE`

Chạy thủ công:
`setupSystem()`

Hệ thống tự tạo 4 sheet:
- USERS
- DAILY_REPORTS
- TASKS
- EVALUATIONS

## 2. Tạo tài khoản
Trong Apps Script editor chạy ví dụ:

```javascript
createUser('ceo', 'MatKhauCEO123!', 'CEO POPOPHONE', 'CEO', '');
createUser('ql.tdm', 'MatKhauQL123!', 'QL TDM', 'MANAGER', 'TDM');
createUser('ql.thuangiao', 'MatKhauQL123!', 'QL Thuận Giao', 'MANAGER', 'Thuận Giao');
```

Mật khẩu KHÔNG lưu plaintext. Sheet chỉ lưu SHA-256 hash + salt.

## 3. Deploy Apps Script
Deploy > New deployment > Web app
- Execute as: Me
- Who has access: Anyone

Copy URL `/exec`.

## 4. Cấu hình frontend
Mở:
`frontend/config.js`

Thay:
`PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE`

bằng URL Apps Script `/exec`.

## 5. Deploy Netlify
Kéo nguyên thư mục `frontend` lên Netlify hoặc connect Git repo.

## Luồng quyền
### MANAGER
- Xem / sửa báo cáo của chính mình + đúng chi nhánh.
- Lưu nháp.
- Nộp báo cáo.
- Không được gọi dashboard CEO / đánh giá / xem toàn hệ thống.

### CEO
- Dashboard toàn hệ thống.
- Xem báo cáo gốc từng QL.
- Xem vấn đề nổi bật.
- Giao việc.
- Đánh giá QL.

## Bảo mật
- Session token sống 12 giờ trong Apps Script Cache.
- Server kiểm tra role ở MỌI API.
- Branch của QL lấy từ USERS, không tin dữ liệu frontend.
- Không lưu mật khẩu plaintext.
- Không dùng URL/query để quyết định quyền.

## Lưu ý production
Bản này là nền tảng chạy thật. Khi đưa vào vận hành chính thức nên:
1. Đổi mật khẩu mạnh cho tất cả tài khoản.
2. Không chia sẻ Spreadsheet cho nhân viên không cần thiết.
3. Chỉ CEO/admin được sửa USERS.
4. Sau khi ổn định, bổ sung log audit và reset password.
5. Nếu muốn đăng nhập bằng Google Workspace thay username/password, thay module auth sau mà không cần đổi cấu trúc report.
