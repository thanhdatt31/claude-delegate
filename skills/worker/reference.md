# worker — tham khảo

Chỉ đọc phần cần dùng.

## Hỗ trợ lên plan (task lớn)
Thu thập ngữ cảnh (đọc file, lần theo lời gọi hàm, đọc log hay tài liệu) là phần tốn token nhất. Mọi thứ Claude tự đọc nằm lại trong ngữ cảnh và làm mọi lượt suy nghĩ sau đắt thêm. Giao phần này cho worker; Claude giữ phần suy luận và quyết định.
1. Viết ra các **câu hỏi cụ thể** cần trả lời để lên plan, ví dụ "request đi qua những hàm nào từ route X đến DB", "chỗ nào ghi vào bảng Y", "test nào bao phủ module Z".
2. Gom câu hỏi theo vùng, mỗi vùng một worker `read` (`--name ctx-<vùng>`, 1–3 worker chạy song song). Mỗi câu trả lời là một finding có `evidence` dạng `file:dòng`. Câu nào không trả lời được thì ghi trong `deviations`, không được đoán.
3. Claude suy nghĩ trên các bản kết quả. Với những điểm quyết định hướng đi của plan, chỉ đọc đúng các dòng trong `evidence`.
4. Tuỳ chọn, với plan rủi ro: giao plan nháp cho một worker `read` (`--name critique`) để tìm lỗ hổng. Claude tự quyết định nhận góp ý nào.
5. Plan chốt xong mới giao phần thực thi, hoặc Claude tự làm.

Không dùng cách này khi codebase nhỏ, Claude đã nắm rõ, hoặc cần trả lời ngay (worker mất 1–3 phút).

## Các lệnh của cx-worker
| Lệnh | Việc |
|---|---|
| `run <dir> <task.md> [--name N] [--mode read\|edit] [--allow G]... [--deny G]... [--trust] [--bash-allow P]... [--network] [--max-iter 3] [--schema F\|none] [--model M] [--effort E] [-v]` | Giao việc |
| `resume <dir> "<msg>" --name N` | Thêm một turn vào thread cũ, giữ ngữ cảnh |
| `ctl <dir> approve\|deny <key> --name N` | Trả lời một yêu cầu duyệt (chỉ khi edit không có `--trust`) |
| `ctl <dir> steer "<msg>" \| interrupt \| quit --name N` | Chỉnh hướng, dừng turn, thoát |
| `result <dir> --name N [--brief]` | Kết quả cuối |
| `log <dir> --name N [-n 15]` | Sự kiện gần nhất: lệnh, file đã sửa, tin nhắn `BƯỚC n` |
| `list [<dir>]` | Danh sách worker và trạng thái |
| `restore <dir> --name N` | Khôi phục về snapshot (edit) |

Trạng thái nằm ở `${XDG_STATE_HOME:-~/.local/state}/cx-worker/<dir>-<hash>/<name>/` (task.md, scope.json, state.json, log.txt, result.json, snapshot/). Không có gì được ghi vào `<dir>`.

## Schema kết quả mặc định
`status` (done|partial|blocked), `summary`, `findings[{title, detail, evidence}]`, `files_changed`, `checks[{check, result}]`, `iterations`, `sources`, `deviations`, `next_steps`. Muốn khuôn khác thì `--schema <file.json>` (JSON Schema dạng strict: mọi property nằm trong `required`, `additionalProperties: false`). Muốn văn bản tự do thì `--schema none`.

## An toàn
- **read:** sandbox chỉ đọc của Codex; không ghi được gì.
- **edit --trust:** sandbox `workspace-write` nên chỉ ghi được trong `<dir>`, và không có mạng nếu không có `--network`. Trước khi giao, cả `<dir>` được snapshot (bỏ qua `.git`, `node_modules`, `.venv`, `__pycache__`; tối đa 200MB). Khi xong, mọi file bị thêm, sửa hay xoá ngoài `--allow` được khôi phục từ snapshot. Lưu ý: các thư mục bị bỏ qua (kể cả `.git`) không được kiểm tra, và trong lúc chạy worker vẫn ghi tạm được ngoài phạm vi trước khi bị hoàn tác.
- **edit không --trust:** mỗi lần sửa file phải xin duyệt; ngoài `--allow` thì bị từ chối ngay. Lệnh lạ chờ Claude duyệt. Lệnh ghép được tách ra kiểm tra từng phần, heredoc chỉ xét dòng mở đầu. `$(...)`, backtick hay ghi file bằng `>` luôn phải duyệt. `rm -rf`, `sudo`, `git push/commit/reset/checkout/...` luôn bị từ chối. `--bash-allow 'python3 *'` cho script ghi được bất cứ đâu trong `<dir>`.
- Prompt của worker cấm commit, đổi branch, cài đặt nếu nhiệm vụ không yêu cầu, và bắt mọi khẳng định phải có bằng chứng.

## opencode (backend phụ)
`<base>/scripts/oc-delegate` điều khiển opencode qua `opencode serve` (cổng 4555). Dùng khi người dùng muốn opencode hoặc cần model của provider khác. Luồng: `oc-delegate start <repo> <plan> --allow G... --bash-allow P...`, rồi `oc-delegate watch <repo> --until-idle` (chạy nền), duyệt bằng `oc-delegate approve|deny <repo> <id>`, chỉnh hướng bằng `oc-delegate say`, dừng bằng `abort`. Plugin `scope-guard` của opencode chặn sửa file ngoài phạm vi. Xong việc thì `oc-delegate server stop`.

## Xử lý sự cố
- Worker không xong: `cx-worker log` để xem đang làm gì; `cx-worker list` thấy `dead` nghĩa là tiến trình điều khiển đã chết, đọc `server.log` trong thư mục trạng thái.
- `thread/start` lỗi model: `codex login` lại, hoặc `codex update`; xem model có sẵn bằng app-server `model/list`.
- Worker trả `status: blocked`: đọc `deviations`, làm rõ nhiệm vụ rồi `resume`.
