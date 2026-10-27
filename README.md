# worker

Plugin Claude Code biến **Codex thành worker** cho Claude. Claude hiểu việc, viết nhiệm vụ kèm tiêu chí hoàn thành, rồi giao cho Codex chạy qua `codex app-server`. Trong lúc worker làm, Claude theo dõi từng hành động: tự duyệt những gì an toàn và trong phạm vi, từ chối phần còn lại, chen chỉ dẫn khi worker đi lệch. Xong việc, Claude tự kiểm chứng kết quả chứ không dựa vào báo cáo của worker.

Không chỉ cho code:
- **read**: điều tra lỗi, phân tích log, review, khảo sát codebase. Sandbox chỉ đọc, nhanh, không cần duyệt.
- **edit --trust**: sửa code, viết tài liệu, làm sạch dữ liệu, sắp xếp file. Worker chạy không cần duyệt từng lệnh; khi xong, mọi thay đổi ngoài phạm vi glob tự bị hoàn tác từ snapshot.
- **--network**: tìm web và truy cập mạng cho việc nghiên cứu.

Kết quả trả về dạng JSON có cấu trúc (findings kèm bằng chứng, file đã đổi, kiểm tra đã chạy, nguồn). Worker tự sửa và kiểm chứng lại đến khi đạt. Claude chỉ nhận một dòng tóm tắt khi xong, nên phần điều phối tốn rất ít token Claude. Chạy được nhiều worker song song. opencode được hỗ trợ làm backend phụ.

## Cài đặt

Trong một phiên Claude Code ở terminal:

```
/plugin install worker --marketplace thanhdatt31/claude-delegate
```

Hoặc từ shell:

```
claude plugin install worker --marketplace thanhdatt31/claude-delegate
```

Trả lời `y` để thêm marketplace, rồi chọn scope (mặc định là user).

Trong app desktop: bấm + cạnh ô nhập, chọn Plugins, Add marketplace với `thanhdatt31/claude-delegate`, rồi Add plugin.

## Chuẩn bị trên mỗi máy

- `python3` (3.9 trở lên) và `git`.
- **Codex CLI**: `curl -fsSL https://chatgpt.com/codex/install.sh | sh`, rồi `codex login`.
- **opencode** (tuỳ chọn): `curl -fsSL https://opencode.ai/install | bash`, rồi `opencode auth login`.

Lần đầu dùng, Claude chạy `scripts/setup` để kiểm tra máy và cài phần cho opencode (nếu có).

## Cách dùng

```
/worker tìm nguyên nhân test X fail, chỉ đọc
/worker làm sạch data/sales.csv thành clean.csv và viết báo cáo
/worker nghiên cứu 3 thư viện queue cho Python, có nguồn --network
```

Hoặc chỉ cần nói "giao cho codex làm việc này".

## Thành phần

- `skills/worker/SKILL.md`: quy trình cho Claude.
- `skills/worker/scripts/cx-worker`: điều khiển Codex (`run`, `resume`, `ctl approve|deny|steer|interrupt|quit`, `result`, `list`, `restore`).
- `skills/worker/scripts/oc-delegate`: backend opencode.
- `skills/worker/opencode/`: agent `delegate` và plugin `scope-guard` cho opencode.
- `skills/worker/scripts/setup`: kiểm tra và cài đặt.
