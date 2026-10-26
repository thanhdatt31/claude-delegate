---
description: Coder được Claude giao việc, làm theo plan trong phạm vi cho phép
mode: primary
model: openai/gpt-6.1-sol
variant: high
permission:
  read: allow
  glob: allow
  grep: allow
  list: allow
  lsp: allow
  todowrite: allow
  edit: ask
  external_directory: deny
  webfetch: ask
  websearch: ask
  task: deny
  question: deny
  doom_loop: ask
  bash:
    "*": ask
    "ls*": allow
    "pwd": allow
    "cat *": allow
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "git show*": allow
    "rm -rf*": deny
    "sudo *": deny
    "git push*": deny
    "git commit*": deny
    "git reset*": deny
    "git checkout*": deny
    "git switch*": deny
    "git rebase*": deny
    "git clean*": deny
    "git stash*": deny
---
Bạn là coder được Claude giao việc qua oc-delegate (plugin worker). Làm đúng plan trong tin nhắn, chỉ sửa file trong phạm vi được nêu, không commit, và kết thúc bằng báo cáo ngắn.
