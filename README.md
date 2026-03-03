# RIPPLES Worldtext Generator

This workspace contains an interactive single-page application for the RIPPLES project—a latent interface for generating poetic "worldtext" from nonhuman perspectives.

## Structure

- `index.html` – main application page (formerly `site/ripples.html`).
- `styles.css` – stylesheet with retro/CRT aesthetic (moved from `site/`).
- `app.js` – core JavaScript implementing state, UI logic, and OpenAI integration (moved from `site/`).

The `site/` directory now hosts a separate website and is kept for archival purposes; it is **not** part of the RIPPLES app.
## Getting Started

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari).
2. The scenario selector defaults to `THE CUPBOARD` and will populate the grid and entity list.
3. Click an entity to select it; use the buttons or keyboard shortcuts **G**, **O**, **S** to trigger vectors.
4. Worldtext appears in the viewport; ripples animate on the grid and the audit log records each action.

### Autoplay & Ambient Behavior

- Press **Space** or click the autoplay toggle to enable automatic ripples based on ambient behaviors.
- A countdown timer shows the time until the next event. You can adjust the tempo by editing the `bpm` variable in `app.js`.

### OpenAI Integration

The application can call the OpenAI API to generate fresh worldtext. To enable this:

1. Obtain an API key from OpenAI.
2. Insert it into `site/app.js` at the top:
   ```js
   const OPENAI_API_KEY = 'your-key-here';
   ```
3. When the key is present, every ripple will send a prompt to the OpenAI `chat/completions` endpoint. Latent descriptions are used as seeds but the model can produce new variations.

> **Security note:** Exposing your API key in a client-side app is insecure. In a production deployment you should proxy requests through a server or use a key with strict restrictions.

If `OPENAI_API_KEY` is left blank the app will fall back to the pre‑written latent descriptions only.

## Extending the System

- Add new scenarios to the `latentLibrary` object in `app.js`. Follow the structure shown in the sample. A forest scenario with boulder, pine, ants’ nest, mushroom, and cloud is included as the default. You can now dynamically add up to 10 entities using the "Add Entity" button below the entity list; each click inserts a random suitable creature or object. Separate GOAL/OBSTACLE/SHIFT control buttons have been removed—the latent text entries themselves act as vector buttons and are prefixed with "GOAL:", "OBSTACLE:", or "SHIFT:" to make their function clear. After clicking one of these entries (or pressing the corresponding key), a new **Lock & Play** button becomes active. (Key presses no longer trigger ripples immediately—they simply set the pending vector.) Clicking the lock button will "lock in" the vector and then play the ripple outward through the ecology, starting from the selected entity and moving through adjacent connections. Pending selections are highlighted until the lock is executed. The audit log panel is still present in the markup but hidden by default via CSS.
- Customize CSS variables for color or layout tweaks (theme is now light/airy by default).
- Implement additional controls (tempo dial, crossfader, recording) in the sidebar.

## Development

- Serve the workspace root (e.g. `python -m http.server` or `npx serve`) to host the app. The `site/` folder is unrelated to the RIPPLES application.

---

This specification was derived from the RIPPLES system prompt, which contains detailed design notes for building the interface from scratch.