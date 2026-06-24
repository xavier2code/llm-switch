# Security

## Supported versions

`llm-switch` is in the `0.x.y` range. While in `0.x`, **only the latest minor version receives security fixes**. Older minors (e.g. `0.3.x` after `0.4.x` ships) will not get backported patches.

If you're on `0.3.x` and want the security fixes in `0.4.x`, please upgrade.

| Version | Supported |
|---|---|
| Latest `0.x.y` | ✅ Active fixes |
| Older `0.x.y` | ❌ End of life |

## Reporting a vulnerability

**Please don't open a public GitHub issue for security bugs.**

Email **`xavier2code@gmail.com`** with:

- A clear description of the vulnerability
- Reproduction steps (settings.json shape, command run, observed vs expected behavior)
- Impact assessment (what can an attacker do?)
- Any known workarounds

PGP is not currently offered; email is sufficient for initial contact. I will:

1. Acknowledge within 3 business days
2. Investigate and develop a fix
3. Coordinate disclosure timing with you
4. Credit you in the CHANGELOG (unless you'd prefer to remain anonymous)

If I don't respond within 3 business days, please follow up — sometimes GitHub notification emails go to spam.

## Known security properties

The following behaviors are intentional and documented (not vulnerabilities):

- **API keys are stored in plaintext on disk** in `~/.claude/settings.json` and `settings.json.<alias>`. Since `0.4.2`, every file the CLI writes is automatically `chmod 0600`, so the key is only readable by your user account on Unix systems. On a multi-user machine, file permissions are the only protection — use a strong user password and consider full-disk encryption.
- **The CLI makes outbound HTTPS requests** to provider URLs during `create` validation (since `0.4.2`, non-HTTPS URLs are rejected; HTTP is allowed only for `localhost` / `127.0.0.1` / `::1` for local proxies like LiteLLM).
- **Atomic file replacement** for `settings.json` uses `fs.rename` after writing to a temp file. The previous `settings.json` is moved to `settings.json.bak`. The backup file has the same permissions as the file it replaced.

## Dependency vulnerabilities

CI runs `pnpm audit --prod --audit-level=high` on every PR and push to main. Dependabot opens weekly PRs for `minor` and `patch` updates. We don't auto-merge major dependency bumps.

If you find a dependency vulnerability that CI hasn't caught, please report it via the email above.

## Historical security fixes

See the CHANGELOG entries under the `### Security` heading for past fixes. Notable items:

- **0.4.2** — Auto-`chmod 600` on all profile writes; HTTPS-only BASE_URL enforcement
