// scope-guard: chặn sửa file ngoài phạm vi plan và ghi audit log mọi tool call.
// Chỉ hoạt động khi project có file .delegate/scope.json, ví dụ:
//   { "allow": ["src/**", "tests/**"], "deny": ["src/secrets/**"] }
// Không có file đó thì plugin không làm gì, opencode chạy như bình thường.
import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve } from "node:path"

type Scope = { allow?: string[]; deny?: string[] }

function globToRegex(glob: string): RegExp {
  let re = ""
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++
        if (glob[i + 1] === "/") {
          i++
          re += "(?:.*/)?"
        } else re += ".*"
      } else re += "[^/]*"
    } else if (c === "?") re += "[^/]"
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${re}$`)
}

const matches = (rel: string, globs: string[] = []) => globs.some((g) => globToRegex(g).test(rel))

// Lấy mọi đường dẫn file mà một tool call định ghi vào.
function targetPaths(args: any): string[] {
  if (!args || typeof args !== "object") return []
  const out: string[] = []
  for (const key of ["filePath", "file_path", "path"]) {
    if (typeof args[key] === "string") out.push(args[key])
  }
  for (const key of ["patchText", "patch", "input"]) {
    const text = args[key]
    if (typeof text !== "string") continue
    for (const m of text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) {
      out.push((m[1] ?? m[2]).trim())
    }
  }
  if (Array.isArray(args.edits)) for (const e of args.edits) out.push(...targetPaths(e))
  return out
}

const WRITE_TOOLS = new Set(["edit", "write", "patch", "multiedit", "apply_patch"])

export const ScopeGuard: Plugin = async ({ directory, worktree }) => {
  const root = [directory, worktree].find((d) => d && existsSync(join(d, ".delegate", "scope.json")))
  if (!root) return {}
  const scopeFile = join(root, ".delegate", "scope.json")
  const auditFile = join(root, ".delegate", "audit.jsonl")
  const audit = (entry: object) => {
    try {
      appendFileSync(auditFile, JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n")
    } catch {}
  }
  audit({ event: "plugin.loaded", root })

  return {
    "tool.execute.before": async (input, output) => {
      // Đọc lại scope mỗi lần để Claude chỉnh phạm vi giữa chừng không cần restart.
      const scope: Scope = JSON.parse(readFileSync(scopeFile, "utf8"))
      const paths = WRITE_TOOLS.has(input.tool) ? targetPaths(output.args) : []
      for (const p of paths) {
        const abs = isAbsolute(p) ? p : resolve(root, p)
        const rel = relative(root, abs)
        const inside = !rel.startsWith("..") && !isAbsolute(rel)
        if (!inside || !matches(rel, scope.allow) || matches(rel, scope.deny)) {
          audit({ event: "blocked", session: input.sessionID, tool: input.tool, path: rel })
          throw new Error(
            `scope-guard: "${rel}" nằm ngoài phạm vi được phép (${(scope.allow ?? []).join(", ")}). ` +
              `Không sửa file này. Nếu thật sự cần, dừng lại và giải thích lý do trong câu trả lời.`,
          )
        }
      }
      audit({ event: "tool", session: input.sessionID, tool: input.tool, paths, args: summarize(output.args) })
    },
  }
}

function summarize(args: any) {
  if (!args || typeof args !== "object") return args
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    out[k] = typeof v === "string" && v.length > 300 ? v.slice(0, 300) + `…(${v.length} chars)` : v
  }
  return out
}
