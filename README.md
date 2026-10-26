# delegate

Plugin Claude Code cho quy trình "Claude lập plan, đệ code, Claude giám sát". Claude đọc code, viết plan kèm phạm vi file và lệnh kiểm chứng. Sau khi bạn duyệt plan, Claude giao việc cho **Codex** (mặc định, qua `codex app-server`) hoặc **opencode** (qua `opencode serve`). Trong lúc đệ làm, Claude theo dõi từng hành động: tự duyệt các lần sửa file trong phạm vi và các lệnh đã cho phép, từ chối mọi thứ ngoài phạm vi, chen chỉ dẫn khi đệ đi lệch. Cuối cùng Claude tự review diff và chạy lại test, không dựa vào báo cáo của đệ.

## Cài đặt

Trong một phiên Claude Code ở terminal:

```
/plugin install delegate --marketplace thanhdatt31/claude-delegate
```

Hoặc từ shell:

```
claude plugin install delegate --marketplace thanhdatt31/claude-delegate
```

Trả lời `y` để thêm marketplace, rồi chọn scope (mặc định là user).

Trong app desktop: bấm + cạnh ô nhập, chọn Plugins, Add marketplace với `thanhdatt31/claude-delegate`, rồi Add plugin.

## Chuẩn bị trên mỗi máy

- `python3` (3.9 trở lên) và `git`.
- **Codex CLI**: `curl -fsSL https://chatgpt.com/codex/install.sh | sh`, rồi `codex login`.
- **opencode** (tuỳ chọn): `curl -fsSL https://opencode.ai/install | bash`, rồi `opencode auth login`.

Lần đầu dùng, Claude chạy `scripts/setup` để kiểm tra máy và cài agent `delegate` cùng plugin `scope-guard` vào `~/.config/opencode` (nếu có opencode).

## Cách dùng

```
/delegate sửa bug X trong repo này, thêm test
/delegate opencode thêm endpoint Y
```

Hoặc chỉ cần nói "giao cho codex làm task này".

## Thành phần

- `skills/delegate/SKILL.md`: quy trình cho Claude.
- `skills/delegate/scripts/cx-delegate`: điều khiển Codex qua app-server (duyệt sửa file và lệnh, `steer`, `interrupt`, `resume`).
- `skills/delegate/scripts/oc-delegate`: điều khiển opencode qua HTTP API (duyệt quyền, todo, diff, abort, revert).
- `skills/delegate/opencode/`: agent `delegate` và plugin `scope-guard` cho opencode.

Trạng thái mỗi lần giao việc nằm trong `<repo>/.delegate/`, thư mục này tự được thêm vào `.git/info/exclude`.
