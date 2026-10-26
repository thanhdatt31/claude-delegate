---
name: delegate
description: Giao việc code cho Codex (mặc định) hoặc opencode, Claude lập plan, giám sát từng hành động và tự review kết quả. Dùng khi người dùng gõ /delegate, hoặc bảo "giao cho codex/opencode", "delegate task này", "để đệ code". Với task code rõ ràng, phạm vi hẹp, có cách kiểm chứng (test/build) thì có thể đề xuất dùng skill này, nhưng phải hỏi trước, không tự giao.
argument-hint: "[codex|opencode] <mô tả task>"
---

# /delegate — Claude lập plan, đệ code, Claude giám sát

Scripts nằm trong thư mục `scripts/` cạnh file này (dùng đường dẫn tuyệt đối từ "Base directory for this skill"):
- `scripts/cx-delegate`: Codex qua `codex app-server`. **Mặc định.** Có sandbox hệ điều hành, mỗi lần sửa file đều xin duyệt, chen chỉ dẫn giữa chừng được (`steer`).
- `scripts/oc-delegate`: opencode qua `opencode serve`. Dùng khi người dùng chọn opencode hoặc cần model của provider khác. Có todo list có cấu trúc.
- `scripts/setup`: kiểm tra máy và cài agent/plugin cho opencode. Chạy một lần trên mỗi máy mới, hoặc khi một script báo thiếu.

## Khi nào không dùng
Task mơ hồ, cần thiết kế, đụng nhiều phần hệ thống, hoặc không có cách kiểm chứng: tự làm, hoặc nói với người dùng vì sao không nên giao.

## Quy trình

1. **Chuẩn bị.** Repo phải là git repo. Working tree bẩn thì hỏi người dùng có commit/stash trước không, vì diff của đệ phải tách bạch được. Chạy `scripts/setup` nếu chưa chạy trên máy này.
2. **Đọc code rồi viết plan** vào `<repo>/.delegate/PLAN.md` (thư mục `.delegate/` tự được thêm vào `.git/info/exclude`). Plan phải có:
   - Các bước đánh số, mỗi bước nói rõ file và hành vi cần đạt.
   - Lệnh kiểm chứng chính xác (test, lint, build).
   - Phạm vi file được sửa (glob), và điều cấm làm.
3. **Đưa plan cho người dùng duyệt** (tóm tắt các bước, phạm vi, lệnh kiểm chứng). Chưa duyệt thì chưa giao.
4. **Giao việc** (chạy nền bằng Bash `run_in_background`):
   ```
   <base>/scripts/cx-delegate run <repo> <repo>/.delegate/PLAN.md --allow 'src/**' --allow 'tests/**' \
       --bash-allow '<lệnh test chính xác>*' --until-idle
   ```
   opencode: `<base>/scripts/oc-delegate start <repo> <plan> --allow ... --bash-allow ...` rồi `oc-delegate watch <repo> --until-idle` (chạy nền).
   Mặc định model `gpt-6.1-sol`, mức `high` (`--model`, `--effort`; opencode: `--model openai/...`, `--variant`).
5. **Giám sát** bằng Monitor trên file output của lệnh nền:
   `tail -n +1 -f <output> | grep --line-buffered -E "PLAN|TODO|✔|▶|✘|⚠|‼|■|→|✓|⏹|💬|Traceback|Error|lỗi"`
   - `⚠ CẦN DUYỆT <key>`: đọc lệnh. Chỉ đọc, hoặc rõ ràng thuộc plan, thì `cx-delegate ctl <repo> approve <key>`. Nghi ngờ thì `deny`, và báo người dùng nếu là thứ quan trọng. opencode: `oc-delegate approve|deny <repo> <id>`.
   - Đệ đi lệch plan: `cx-delegate ctl <repo> steer "<chỉ dẫn cụ thể>"` (opencode: `oc-delegate say`). Lệch nặng thì `ctl ... interrupt` (opencode: `abort`).
   - Cập nhật người dùng ngắn gọn khi chuyển bước hoặc khi có sự cố, không thuật lại từng sự kiện.
6. **Review độc lập, không tin báo cáo của đệ:** `git status`, `git diff`, chạy lại lệnh kiểm chứng, thử thêm vài trường hợp biên tự nghĩ ra, và đối chiếu từng bước của plan.
7. **Sửa nếu cần:** `cx-delegate run <repo> --resume "<feedback cụ thể>" --until-idle` (opencode: `oc-delegate say`), rồi quay lại bước 6.
8. **Báo cáo** cho người dùng: đã làm gì, kết quả kiểm chứng, chỗ nào phải duyệt tay hoặc chỉnh hướng, việc còn lại. Không commit trừ khi người dùng bảo.

## Lưu ý
- `--allow` để hẹp nhất có thể. Mọi lần sửa file ngoài phạm vi đều bị từ chối: với Codex là từ chối yêu cầu duyệt, với opencode là plugin scope-guard chặn.
- `--bash-allow` chỉ ghi lệnh kiểm chứng. Lệnh ghép được tách ra và kiểm tra từng phần. Lệnh có `$(...)`, backtick hoặc ghi file bằng `>` luôn phải duyệt tay.
- Tiến trình `cx-delegate run` kết thúc khi turn xong (`--until-idle`). Muốn giao tiếp thì dùng `--resume`, thread cũ vẫn giữ ngữ cảnh.
- opencode chạy server cố định ở cổng 4555 (`OC_DELEGATE_PORT`). Xong việc thì `oc-delegate server stop`.
