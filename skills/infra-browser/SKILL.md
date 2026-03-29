---
name: infra-browser
description: Browser automation with persistent page state. Use when users ask to navigate websites, fill forms, take screenshots, extract web data, test web apps, or automate browser workflows. Trigger phrases include "go to [url]", "click on", "fill out the form", "take a screenshot", "scrape", "automate", "test the website", "log into", or any browser interaction request.
---

# Dev Browser Skill

Browser automation that maintains page state across script executions. Write small, focused scripts to accomplish tasks incrementally. Once you've proven out part of a workflow and there is repeated work to be done, you can write a script to do the repeated work in a single execution.

## Choosing Your Approach

- **Local/source-available sites**: Read the source code first to write selectors directly
- **Unknown page layouts**: Use `getAISnapshot()` to discover elements and `selectSnapshotRef()` to interact with them
- **Visual feedback**: Take screenshots to see what the user sees

## Setup

Two modes available. Ask the user if unclear which to use.

### Standalone Mode (Default)

Launches a new Chromium browser for fresh automation sessions.

```bash
./skills/infra-browser/server.sh &
```

Add `--headless` flag if user requests it. **Wait for the `Ready` message before running scripts.**

### Extension Mode

Connects to user's existing Chrome browser. Use this when:

- The user is already logged into sites and wants you to do things behind an authed experience that isn't local dev.
- The user asks you to use the extension

**Important**: The core flow is still the same. You create named pages inside of their browser.

**Start the relay server:**

```bash
cd skills/infra-browser && npm i && npm run start-extension &
```

Wait for `Waiting for extension to connect...`

**Workflow:**

1. Scripts call `client.page("name")` just like the normal mode to create new pages / connect to existing ones.
2. Automation runs on the user's actual browser session

If the extension hasn't connected yet, tell the user to launch and activate it. Download link: https://github.com/SawyerHood/dev-browser/releases

## Writing Scripts

> **Run all scripts from `skills/infra-browser/` directory.** The `@/` import alias requires this directory's config.

Execute scripts inline using heredocs:

```bash
cd skills/infra-browser && npx tsx <<'EOF'
import { connect, waitForPageLoad } from "@/client.js";

const client = await connect();
const page = await client.page("example"); // descriptive name like "cnn-homepage"
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto("https://example.com");
await waitForPageLoad(page);

console.log({ title: await page.title(), url: page.url() });
await client.disconnect();
EOF
```

**Write to `tmp/` files only when** the script needs reuse, is complex, or user explicitly requests it.

### Key Principles

1. **Small scripts**: Each script does ONE thing (navigate, click, fill, check)
2. **Evaluate state**: Log/return state at the end to decide next steps
3. **Descriptive page names**: Use `"checkout"`, `"login"`, not `"main"`
4. **Disconnect to exit**: `await client.disconnect()` - pages persist on server
5. **Plain JS in evaluate**: `page.evaluate()` runs in browser - no TypeScript syntax

## Workflow Loop

Follow this pattern for complex tasks:

1. **Write a script** to perform one action
2. **Run it** and observe the output
3. **Evaluate** - did it work? What's the current state?
4. **Decide** - is the task complete or do we need another script?
5. **Repeat** until task is done

### No TypeScript in Browser Context

Code passed to `page.evaluate()` runs in the browser, which doesn't understand TypeScript:

```typescript
// ✅ Correct: plain JavaScript
const text = await page.evaluate(() => {
  return document.body.innerText;
});

// ❌ Wrong: TypeScript syntax will fail at runtime
const text = await page.evaluate(() => {
  const el: HTMLElement = document.body; // Type annotation breaks in browser!
  return el.innerText;
});
```

## Scraping Data

For scraping large datasets, intercept and replay network requests rather than scrolling the DOM. See [references/scraping.md](references/scraping.md) for the complete guide covering request capture, schema discovery, and paginated API replay.

## Client API

```typescript
const client = await connect();
const page = await client.page("name"); // Get or create named page
const pages = await client.list(); // List all page names
await client.close("name"); // Close a page
await client.disconnect(); // Disconnect (pages persist)

// ARIA Snapshot methods
const snapshot = await client.getAISnapshot("name"); // Get accessibility tree
const element = await client.selectSnapshotRef("name", "e5"); // Get element by ref
```

The `page` object is a standard Playwright Page.

## Waiting

```typescript
import { waitForPageLoad } from "@/client.js";

await waitForPageLoad(page); // After navigation
await page.waitForSelector(".results"); // For specific elements
await page.waitForURL("**/success"); // For specific URL
```

## Inspecting Page State

### Screenshots

```typescript
await page.screenshot({ path: "tmp/screenshot.png" });
await page.screenshot({ path: "tmp/full.png", fullPage: true });
```

### ARIA Snapshot (Element Discovery)

Use `getAISnapshot()` to discover page elements. Returns YAML-formatted accessibility tree:

```yaml
- banner:
  - link "Hacker News" [ref=e1]
  - navigation:
    - link "new" [ref=e2]
- main:
  - list:
    - listitem:
      - link "Article Title" [ref=e8]
      - link "328 comments" [ref=e9]
- contentinfo:
  - textbox [ref=e10]
    - /placeholder: "Search"
```

**Interpreting refs:**

- `[ref=eN]` - Element reference for interaction (visible, clickable elements only)
- `[checked]`, `[disabled]`, `[expanded]` - Element states
- `[level=N]` - Heading level
- `/url:`, `/placeholder:` - Element properties

**Interacting with refs:**

```typescript
const snapshot = await client.getAISnapshot("hackernews");
console.log(snapshot); // Find the ref you need

const element = await client.selectSnapshotRef("hackernews", "e2");
await element.click();
```

## Large File Upload (>50MB)

Playwright's `setInputFiles()` and `fileChooser.setFiles()` transfer file bytes over the CDP WebSocket, which has a **50MB limit**. For large files (videos, etc.), use the server-side file upload API.

### Server-Side API: `POST /pages/:name/set-file`

The infra-browser server has direct access to Playwright Page objects (no CDP transfer), so it can set files of any size.

```typescript
import { setFileServerSide } from "@/client.js";

// Basic usage - sets file on first input[type="file"]
const result = await setFileServerSide("page-name", "/path/to/large-video.mp4");

// With options
const result = await setFileServerSide("page-name", "/path/to/video.mp4", {
  selector: 'input[type="file"][accept*="video"]',  // specific file input
  frameUrl: "micro/content/post/create",             // target a specific iframe by URL match
  serverUrl: "http://localhost:18273",                 // default
});

// Multiple files
const result = await setFileServerSide("page-name", ["/path/to/img1.jpg", "/path/to/img2.jpg"]);
```

**Response:**
```json
{ "success": true, "method": "locator", "selector": "input[type=\"file\"]", "fileCount": 1 }
```

**Methods tried (in order):**
1. `locator` — `target.locator(selector).first().setInputFiles(paths)` (standard Playwright)
2. `filechooser` — Clicks the element to trigger filechooser event, then `fileChooser.setFiles(paths)` (for shadow DOM / micro-frontends like wujie)

**When to use:**
- File size > 50MB
- File input is inside a shadow DOM or micro-frontend iframe (like wujie)
- Standard `page.setInputFiles()` fails with "Cannot transfer files larger than 50Mb"

## Error Recovery

Page state persists after failures. Debug with:

```bash
cd skills/infra-browser && npx tsx <<'EOF'
import { connect } from "@/client.js";

const client = await connect();
const page = await client.page("hackernews");

await page.screenshot({ path: "tmp/debug.png" });
console.log({
  url: page.url(),
  title: await page.title(),
  bodyText: await page.textContent("body").then((t) => t?.slice(0, 200)),
});

await client.disconnect();
EOF
```
