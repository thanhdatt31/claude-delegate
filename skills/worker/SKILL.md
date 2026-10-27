---
name: worker
description: Giao việc cho Codex làm worker (GPT-6.1 Sol) để Claude đỡ tốn token. Claude viết nhiệm vụ, worker làm (đọc nhiều, sửa nhiều vòng, nghiên cứu), Claude chỉ nhận kết quả JSON rồi kiểm chứng. Dùng cho mọi loại việc tách bạch được, không chỉ code. Dùng khi người dùng gõ /worker, hoặc bảo "giao cho codex", "để worker làm", "delegate", "chạy song song". Gặp việc nặng phù hợp thì có thể đề xuất, nhưng phải hỏi trước, không tự giao.
argument-hint: "<mô tả việc> [read|edit] [--network]"
---

# /worker — Claude điều phối, Codex làm

`<base>` là "Base directory for this skill". CLI: `<base>/scripts/cx-worker`. Chi tiết (hỗ trợ lên plan, an toàn, schema, opencode, xử lý sự cố) nằm trong `<base>/reference.md`, chỉ đọc khi cần. Máy mới hoặc thiếu công cụ thì chạy `<base>/scripts/setup`.

## Có đáng giao không
Chỉ giao khi phần việc của worker nặng hơn hẳn phần Claude điều phối: đọc nhiều file hay log, sửa nhiều vòng đến khi đạt, nghiên cứu, dữ liệu lớn, việc dài chạy song song. Việc Claude làm xong trong vài lần gọi tool thì tự làm. Nếu người dùng vẫn muốn giao, nói một câu về chi phí. Nhiều việc nhỏ độc lập thì gộp vào **một** nhiệm vụ.

## Chế độ
- `--mode read` (mặc định): điều tra, review, phân tích, khảo sát. Sandbox chỉ đọc, không có bước duyệt.
- `--mode edit --allow <glob>... --trust`: sửa code, tài liệu, dữ liệu, file. Không có bước duyệt; khi xong, mọi thay đổi ngoài `--allow` tự bị hoàn tác. **Mặc định dùng `--trust`.** Chỉ bỏ `--trust` (duyệt từng lệnh) khi thư mục quá 200MB hoặc việc có rủi ro cần chặn từ trước.
- `--network`: thêm khi cần web hoặc mạng.

## Quy trình
1. **Viết nhiệm vụ** vào file tạm. Không tự đọc kỹ code hay dữ liệu, vì đọc là việc của worker. Nhiệm vụ gồm: mục tiêu; **tiêu chí hoàn thành kiểm chứng được** (lệnh test, con số phải khớp, bằng chứng file:dòng hoặc URL); phạm vi. Có lệnh kiểm chứng thì worker tự sửa và chạy lại đến khi đạt (`--max-iter`, mặc định 3).
2. **Người dùng duyệt** nếu việc sửa file, dùng mạng hoặc chạy lâu. Việc chỉ đọc thì giao luôn, nói một dòng.
3. **Giao việc** bằng Bash `run_in_background`:
   `<base>/scripts/cx-worker run <dir> <task.md> --name <tên> --mode edit --trust --allow 'src/**'`
   Song song thì mỗi worker một `--name`, và hai worker edit không được trùng phạm vi.
4. **Chờ.** Lệnh nền tự báo khi xong. stdout chỉ in những dòng cần hành động. **Không bật Monitor**, trừ khi chạy edit không có `--trust`; khi đó chỉ nghe `⚠|‼`, và duyệt bằng `cx-worker ctl <dir> approve|deny <key> --name <tên>`. Người dùng hỏi tiến độ thì chạy `cx-worker log <dir> --name <tên>`. Worker đi lệch thì `ctl ... steer "<chỉ dẫn>"` hoặc `ctl ... interrupt`.
5. **Kiểm chứng vừa đủ, không tin báo cáo của worker.** Dòng `■` đã tóm tắt status, summary, files, checks. Cần thêm thì `cx-worker result <dir> --name <tên> --brief`, và chỉ đọc bản đầy đủ khi phải đào sâu. Tự chạy lại tiêu chí hoàn thành và các điểm rủi ro nhất. Diff lớn thì xem `--stat` trước. Dòng `‼ đã hoàn tác ... ngoài phạm vi` nghĩa là worker đã cố sửa ngoài phạm vi; xem nó có cần những thay đổi đó không.
6. **Sửa:** `cx-worker resume <dir> "<feedback cụ thể>" --name <tên>`. Hỏng nặng: `cx-worker restore <dir> --name <tên>`.
7. **Báo cáo** ngắn gọn: kết quả, cách đã kiểm chứng, việc còn lại. Không commit trừ khi người dùng bảo.

Task lớn cần lên plan: giao phần thu thập ngữ cảnh cho worker `read` chạy song song, Claude giữ phần suy luận (xem `reference.md` → "Hỗ trợ lên plan").
