### 📝 Documentation Guidelines (README & docs/)

When asked to create or update documentation, strictly adhere to the following principles:

**1. Keep the `README.md` Simple and User-Friendly**

* **Treat it as a landing page:** The README should be an inviting, high-level overview of the project. It must be accessible to newcomers.
* **Essential sections only:** Include a clear project description, prerequisites, a "Quick Start" (installation/setup), and a basic usage example.
* **Avoid clutter:** Do not dump massive walls of text, extensive API references, or deep technical architecture into the README.
* **Tone:** Keep the language straightforward, concise, and helpful.

**2. Use the `docs/` Folder for Lengthy Documentation**

* **Offload complexity:** Any detailed explanations, extensive tutorials, advanced configuration guides, or comprehensive API references must be placed in separate Markdown files within the `docs/` directory.
* **Link from the README:** Whenever you move complex information to the `docs/` folder, add clear, contextual links in the `README.md` pointing users to the right file (e.g., `[See the full API Reference here](docs/api-reference.md)`).

**3. Workflow for Updates**

* When updating a feature, evaluate if the change belongs in the `README.md` (if it affects basic setup/usage) or in the `docs/` folder (if it's an advanced or niche feature).
* Always ensure links between the `README.md` and the `docs/` folder remain intact and accurate after updates.

## Knowledge stores

* `docs/solutions/` — documented solutions to past problems (bugs, best practices, architecture patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
* `CONCEPTS.md` — shared domain vocabulary (entities, named processes, status concepts). Relevant when orienting to the codebase or discussing domain terms.

### UI & Tailwind Directives

1. **Use Primitives First:** Always check `src/features/ui/` before writing new Tailwind classes for buttons, badges, chips, or section headers. You must use existing primitives (`Button`, `Badge`, `ToggleChip`, `Eyebrow`) instead of hand-rolling custom HTML.
2. **The Rule of Three:** Never copy-paste complex Tailwind class strings (e.g., hover/active states, safe-area math, complex flex alignments) across multiple files. If a specific UI pattern appears in 3 or more places, halt your feature work and extract it into a shared, tested component in `src/features/ui/`.
3. **Extend, Don't Abandon:** If an existing primitive almost fits but needs a tweak (e.g., a new disabled state or color), extend its variant API (like the `Modal.tsx` `Record` map pattern). Do not abandon the primitive to create a one-off styling exception.
4. **Use the Utility:** Never concatenate classes with raw template literals. Always use the `cn()` helper in `src/lib/cn.ts` for conditional Tailwind styling.
