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

## Khi nào đáng giao (chi phí token)
Token của worker tính vào quota OpenAI, không tính vào Claude. Nhưng mỗi lượt Claude điều phối (viết nhiệm vụ, nhận thông báo, duyệt, review) đều tốn token Claude. Chỉ giao khi phần việc của worker nặng hơn hẳn phần điều phối:
- **Đáng giao:** đọc nhiều file hoặc log dài, khảo sát codebase lạ, sửa nhiều vòng đến khi test pass, nghiên cứu web, xử lý dữ liệu lớn, việc chạy lâu có thể làm song song trong lúc Claude làm việc khác, hoặc khi người dùng muốn tiết kiệm quota Claude hay cần góc nhìn của model khác.
- **Không đáng giao:** việc Claude tự làm được trong vài lần gọi tool, như sửa vài dòng hay đọc 2–3 file nhỏ. Giao những việc này tốn token Claude hơn tự làm. Nếu người dùng vẫn yêu cầu giao thì làm, nhưng nói một câu về chi phí.

## Hỗ trợ lên plan (task lớn)
Khi Claude cần lên plan cho một task lớn trên codebase hay tài liệu lạ, chia việc như sau:
- **Thu thập ngữ cảnh → giao worker `read`.** Đọc file, lần theo lời gọi hàm, đọc log hay tài liệu là phần tốn token nhất. Mọi thứ Claude tự đọc nằm lại trong ngữ cảnh và làm mọi lượt suy nghĩ sau đắt thêm. Worker trả về JSON cô đọng nên ngữ cảnh của Claude gọn.
- **Suy luận và quyết định → Claude tự làm.** Không giao cho worker phần cân nhắc phương án hay thiết kế.

Cách làm:
1. Claude viết ra các **câu hỏi cụ thể** cần trả lời để lên plan, ví dụ "request đi qua những hàm nào từ route X đến DB", "những chỗ nào ghi vào bảng Y", "test nào đang bao phủ module Z".
2. Gom các câu hỏi theo vùng, mỗi vùng một worker `read` (`--name ctx-<vùng>`, 1–3 worker chạy song song). Mỗi câu trả lời phải là một finding có `evidence` dạng `file:dòng`. Câu nào không trả lời được thì ghi rõ trong `deviations`, không được đoán.
3. Claude suy nghĩ trên các bản kết quả. Với những điểm **quyết định hướng đi của plan**, Claude tự đọc đúng các dòng trong `evidence`, không đọc lan ra cả file.
4. Tuỳ chọn, với plan rủi ro: giao plan nháp cho một worker `read` (`--name critique`) để tìm lỗ hổng, như trường hợp bị bỏ sót, chỗ mâu thuẫn với code thật, hay bước không kiểm chứng được. Claude tự quyết định nhận góp ý nào.
5. Plan chốt xong mới giao phần thực thi (worker `edit`) hoặc Claude tự làm.

Không dùng cách này khi codebase nhỏ hoặc Claude đã nắm rõ (tự đọc nhanh và rẻ hơn), hoặc khi cần trả lời ngay (worker mất 1–3 phút).

## Quy trình

1. **Hiểu việc và chuẩn bị.** Xác định thư mục làm việc `<dir>`. Với chế độ edit: nếu `<dir>` là git repo có thay đổi chưa commit trong phạm vi sẽ sửa, hỏi người dùng có commit trước không. Không phải git thì cx-worker tự chụp snapshot phạm vi để khôi phục được.
2. **Viết file nhiệm vụ** (ở thư mục tạm, không đặt trong `<dir>` nếu là chế độ read). **Đừng tự đọc code hay dữ liệu để viết plan chi tiết**, vì đọc là việc của worker. Chỉ đọc đủ để xác định mục tiêu, phạm vi và cách kiểm chứng. Nhiệm vụ phải có:
   - Mục tiêu. Chỉ chia bước đánh số khi thứ tự thật sự quan trọng.
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
5. **Giám sát tiết kiệm.** Mỗi thông báo là một lượt Claude, nên chỉ nghe những gì cần hành động:
   - Lệnh nền tự báo khi worker xong, nên **không cần Monitor để biết lúc xong**.
   - Chế độ `read` không có bước duyệt: **không bật Monitor**, chỉ chờ thông báo hoàn thành.
   - Chế độ `edit`: bật Monitor chỉ cho yêu cầu duyệt và sự cố:
     `tail -n +1 -f <output> | grep --line-buffered -E "⚠|‼|Traceback"`
     Đặt `timeout_ms` bằng thời gian dự kiến của việc, tối đa 30 phút.
   - `⚠ CẦN DUYỆT <key>`: đọc lệnh. Chỉ đọc, hoặc rõ ràng phục vụ nhiệm vụ, thì `cx-worker ctl <dir> approve <key> --name <tên>`. Nghi ngờ thì `deny`. Một loại lệnh cứ phải duyệt lặp lại thì lần sau thêm vào `--bash-allow`.
   - Muốn xem tiến độ (khi người dùng hỏi, hoặc việc chạy lâu bất thường): đọc vài dòng cuối của file output một lần. Các dòng `💬 BƯỚC n` cho biết worker đang ở đâu. Lệch hướng thì `ctl ... steer "<chỉ dẫn cụ thể>"`, lệch nặng thì `ctl ... interrupt`.
   - Không thuật lại từng sự kiện cho người dùng. Chỉ báo khi phải duyệt, có sự cố, hoặc khi xong.
6. **Kiểm chứng độc lập, không tin báo cáo của worker, nhưng vừa đủ:**
   - Đọc `cx-worker result <dir> --name <tên>` trước, không đọc toàn bộ log của worker.
   - Kiểm chứng theo tiêu chí hoàn thành và các điểm rủi ro nhất. Không đọc lại mọi thứ worker đã đọc; diff lớn thì xem `git diff --stat` rồi chỉ đọc kỹ các file quan trọng.
   - Chế độ edit: `git diff` (hoặc so với snapshot), chạy lại lệnh kiểm chứng, thử thêm trường hợp biên.
   - Phát hiện, phân tích: chạy lại vài bằng chứng quan trọng nhất.
   - Nghiên cứu: mở lại vài URL trong `sources`.
7. **Sửa nếu cần:** `cx-worker resume <dir> "<feedback cụ thể>" --name <tên>` (thread cũ giữ ngữ cảnh). Hỏng nặng: `cx-worker restore <dir> --name <tên>` (chỉ khi có snapshot) hoặc dùng git.
8. **Báo cáo** cho người dùng: kết quả, cách đã kiểm chứng, chỗ phải duyệt tay hoặc chỉnh hướng, việc còn lại. Không commit trừ khi người dùng bảo.

## Lưu ý an toàn
- Lệnh ghép được tách ra và kiểm tra từng phần. Lệnh có `$(...)`, backtick hoặc ghi file bằng `>` luôn phải duyệt tay. Các lệnh `rm -rf`, `sudo`, `git push/commit/reset/checkout...` luôn bị từ chối.
- `--bash-allow 'python3 *'` cho phép script ghi bất cứ đâu trong `<dir>`, vì sandbox chỉ giới hạn ở `<dir>` chứ không theo `--allow`. Chỉ dùng khi chấp nhận được, và kiểm tra các file ngoài phạm vi sau khi worker xong.
- Trạng thái worker nằm ở `~/.local/state/cx-worker/`, không ghi gì vào `<dir>`. `cx-worker list` xem tất cả worker.
