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
