# Bundled skills

These skills come from third-party projects and keep their original licenses. Files were copied
unchanged except for the folder layout.

| Folder | Source | Commit | License |
| --- | --- | --- | --- |
| `superpowers/` | https://github.com/obra/superpowers | `2ce8aa1` | MIT (`superpowers/LICENSE`) |
| `ponytail/` | https://github.com/DietrichGebert/ponytail | `96608e0` | MIT (`ponytail/LICENSE`) |
| `caveman/` | https://github.com/Shawnchee/caveman-skill | `b82f3a6` | MIT (`caveman/LICENSE`) |
| `graphify/` | https://github.com/Graphify-Labs/graphify | `0a8cd4e` | Apache-2.0 (`graphify/LICENSE`, `graphify/NOTICE`) |
| `karpathy/` | https://github.com/multica-ai/andrej-karpathy-skills | `2c60614` | MIT, declared in the file frontmatter |
| `mcptoon/` | https://github.com/activeing123/mcptoon | `0.8.33` skill | Apache-2.0 |

`claude-mem` (https://github.com/thedotmack/claude-mem, Apache-2.0) is not bundled as a skill.
Its behaviour — capture a session, compress it, inject relevant context next time — is
implemented in `src/memory-store.ts`.

To update a skill, replace its folder and update the commit above.
