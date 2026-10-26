---
name: worker
description: Giao việc cho Codex làm worker (mặc định GPT-6.1 Sol) trong khi Claude lập kế hoạch, giám sát từng hành động và tự kiểm chứng kết quả. Dùng cho mọi loại việc tách bạch được, không chỉ code. Ví dụ điều tra/phân tích/review (chế độ read), sửa code, tài liệu, dữ liệu, file (chế độ edit), nghiên cứu web (--network). Dùng khi người dùng gõ /worker, hoặc bảo "giao cho codex", "để worker làm", "delegate", "chạy song song". Gặp task phù hợp thì có thể đề xuất, nhưng phải hỏi trước, không tự giao.
argument-hint: "<mô tả việc> [read|edit] [--network]"
---

# /worker — Claude điều phối, Codex làm worker

Scripts nằm trong `scripts/` cạnh file này (dùng đường dẫn tuyệt đối từ "Base directory for this skill"; gọi là `<base>` bên dưới):
- `scripts/cx-worker`: backend chính, Codex qua `codex app-server`. Có sandbox hệ điều hành, kết quả JSON theo schema, chen chỉ dẫn giữa chừng (`steer`), nhiều worker song song (`--name`), snapshot/khôi phục.
- `scripts/oc-delegate`: backend phụ, opencode qua `opencode serve`. Chỉ dùng khi người dùng muốn opencode hoặc cần model của provider khác. Đây là luồng sửa file theo plan (xem `oc-delegate --help`).
- `scripts/setup`: kiểm tra máy (python3, git, codex, opencode) và cài phần cho opencode. Chạy một lần trên máy mới, hoặc khi gặp lỗi thiếu công cụ.

## Chọn chế độ
| Việc | Chế độ | Ghi chú |
|---|---|---|
| Điều tra lỗi, phân tích log, review, khảo sát codebase, trả lời câu hỏi về file | `--mode read` (mặc định) | Sandbox chỉ đọc, không cần duyệt lệnh, nhanh nhất |
| Sửa code, viết tài liệu, xử lý dữ liệu, sắp xếp file | `--mode edit --allow <glob>...` | Mỗi lần sửa file phải nằm trong `--allow` |
| Cần web hoặc mạng (nghiên cứu, tải dữ liệu) | thêm `--network` | Bắt worker ghi URL nguồn trong `sources` |

Không nên giao: việc mơ hồ cần trao đổi nhiều với người dùng, việc cần quyết định thiết kế, việc không có cách nào kiểm chứng. Những việc này Claude tự làm.

## Quy trình

1. **Hiểu việc và chuẩn bị.** Xác định thư mục làm việc `<dir>`. Với chế độ edit: nếu `<dir>` là git repo có thay đổi chưa commit trong phạm vi sẽ sửa, hỏi người dùng có commit trước không. Không phải git thì cx-worker tự chụp snapshot phạm vi để khôi phục được.
2. **Viết file nhiệm vụ** (ở thư mục tạm, không đặt trong `<dir>` nếu là chế độ read). Nhiệm vụ phải có:
   - Mục tiêu và các bước đánh số.
   - **Tiêu chí hoàn thành** kiểm chứng được: lệnh test hay kiểm tra, con số phải khớp, hoặc yêu cầu bằng chứng (file:dòng, output, URL).
   - Phạm vi: được và không được đụng vào đâu.
3. **Người dùng duyệt** khi việc có sửa file, dùng mạng, hoặc tốn nhiều thời gian. Việc chỉ đọc và ngắn thì có thể giao luôn, nói một dòng là đang giao gì.
4. **Giao việc** (Bash `run_in_background`):
   ```
   <base>/scripts/cx-worker run <dir> <task.md> --name <tên> --mode read
   <base>/scripts/cx-worker run <dir> <task.md> --name <tên> --mode edit --allow 'src/**' --bash-allow 'npm test*'
   ```
   - `--bash-allow` chỉ ghi lệnh worker cần chạy để làm và kiểm chứng. Lệnh chỉ đọc phổ biến đã được tự duyệt sẵn.
   - Kết quả mặc định là JSON gồm `status, summary, findings[{title,detail,evidence}], files_changed, checks, sources, deviations, next_steps`. Muốn khuôn khác thì `--schema <file.json>`, muốn văn bản tự do thì `--schema none`.
   - Song song: mỗi worker một `--name` riêng. Hai worker edit không được trùng phạm vi file.
5. **Giám sát** bằng Monitor trên file output của lệnh nền:
   `tail -n +1 -f <output> | grep --line-buffered -E "⚠|‼|💬|✘|■|Traceback"`
   - `⚠ CẦN DUYỆT <key>`: đọc lệnh. Chỉ đọc, hoặc rõ ràng phục vụ nhiệm vụ, thì `cx-worker ctl <dir> approve <key> --name <tên>`. Nghi ngờ thì `deny`.
   - Worker đi lệch: `cx-worker ctl <dir> steer "<chỉ dẫn cụ thể>" --name <tên>`. Lệch nặng thì `ctl ... interrupt`.
   - Báo người dùng ngắn gọn khi chuyển bước hoặc có sự cố, không thuật lại từng sự kiện.
6. **Kiểm chứng độc lập, không tin báo cáo của worker:**
   - Đọc `cx-worker result <dir> --name <tên>`.
   - Chế độ edit: `git diff` (hoặc so với snapshot), chạy lại lệnh kiểm chứng, thử thêm trường hợp biên.
   - Phát hiện, phân tích: chạy lại vài bằng chứng quan trọng nhất.
   - Nghiên cứu: mở lại vài URL trong `sources`.
7. **Sửa nếu cần:** `cx-worker resume <dir> "<feedback cụ thể>" --name <tên>` (thread cũ giữ ngữ cảnh). Hỏng nặng: `cx-worker restore <dir> --name <tên>` (chỉ khi có snapshot) hoặc dùng git.
8. **Báo cáo** cho người dùng: kết quả, cách đã kiểm chứng, chỗ phải duyệt tay hoặc chỉnh hướng, việc còn lại. Không commit trừ khi người dùng bảo.

## Lưu ý an toàn
- Lệnh ghép được tách ra và kiểm tra từng phần. Lệnh có `$(...)`, backtick hoặc ghi file bằng `>` luôn phải duyệt tay. Các lệnh `rm -rf`, `sudo`, `git push/commit/reset/checkout...` luôn bị từ chối.
- `--bash-allow 'python3 *'` cho phép script ghi bất cứ đâu trong `<dir>`, vì sandbox chỉ giới hạn ở `<dir>` chứ không theo `--allow`. Chỉ dùng khi chấp nhận được, và kiểm tra các file ngoài phạm vi sau khi worker xong.
- Trạng thái worker nằm ở `~/.local/state/cx-worker/`, không ghi gì vào `<dir>`. `cx-worker list` xem tất cả worker.
