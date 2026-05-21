/**
 * In-app documentation for Amianto Editor and scripting API.
 */
(function () {
  'use strict';

  const DOCS_HTML = `
<article class="docs-article">
  <section id="doc-overview" class="docs-section">
    <h2>Overview</h2>
    <p><strong>Amianto Editor</strong> is a browser-based point-and-click adventure game editor. You build rooms, place interactive objects, define walkable areas and hotspots, manage characters and inventory, design GUI overlays, and drive game logic with <strong>JavaScript</strong> scripts executed in a sandboxed runtime.</p>
    <ul>
      <li><strong>Editor</strong> (<code>index.html</code>) — design and save projects (Firestore / local cache).</li>
      <li><strong>Runtime</strong> (<code>runtime.html</code> + <code>JS/runtime.js</code>) — plays exported JSON and runs your scripts with the same API as Play Test.</li>
    </ul>
    <p>Open a project from <strong>Projects</strong> before using design tabs. <strong>Docs</strong> is always available without a project.</p>
  </section>

  <section id="doc-quickstart" class="docs-section">
    <h2>Quick start</h2>
    <ol>
      <li>Log in and open <strong>Projects</strong> → create or select a project.</li>
      <li><strong>Rooms</strong> — create a room, add background, scene objects, walkable polygon, hotspots.</li>
      <li><strong>Characters</strong> — create the player, upload <strong>walking</strong> frames (8 directions), add optional <strong>custom animations</strong> (e.g. <code>wave</code>), set start room/position.</li>
      <li><strong>Inventory</strong> — define items (keys, tools, etc.).</li>
      <li><strong>Scripts</strong> — write <code>on_game_start</code>, attach scripts to objects/hotspots/GUI.</li>
      <li><strong>PLAY</strong> — Start Test to run the game in the embedded runtime.</li>
    </ol>
    <pre class="docs-code"><code>// Minimal game start script (Global scope)
function on_game_start() {
  print("Welcome!");
  show_message("Your adventure begins.");
}</code></pre>
  </section>

  <section id="doc-tabs" class="docs-section">
    <h2>Editor tabs</h2>
    <table class="docs-table">
      <thead><tr><th>Tab</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><strong>Projects</strong></td><td>Create, open, refresh projects. Required before other tabs.</td></tr>
        <tr><td><strong>Resources</strong></td><td>Central image/sound library (Supabase). Import once, pick assets everywhere.</td></tr>
        <tr><td><strong>Rooms</strong></td><td>Rooms manager, background, foreground layers, scene objects, walkable area, hotspots.</td></tr>
        <tr><td><strong>Inventory</strong></td><td>Inventory items and slot grid for the player UI.</td></tr>
        <tr><td><strong>Characters</strong></td><td>Walking animation + named custom animations (8 directions each), FPS, preview; game start spawn settings.</td></tr>
        <tr><td><strong>GUI</strong></td><td>Overlay screens (inventory bar, menus), buttons with optional scripts.</td></tr>
        <tr><td><strong>Scripts</strong></td><td>CodeMirror editor, script tree, game variables, Run/Stop sandbox.</td></tr>
        <tr><td><strong>Docs</strong></td><td>This guide.</td></tr>
        <tr><td><strong>PLAY</strong></td><td>Live play test with script console and debug tools.</td></tr>
      </tbody>
    </table>
    <h3>Keyboard shortcuts</h3>
    <ul>
      <li><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>9</kbd> — switch tabs (order: Projects → … → Docs → PLAY)</li>
      <li><kbd>Ctrl</kbd>+<kbd>S</kbd> — save current script (Scripts tab)</li>
      <li><kbd>Ctrl</kbd>+<kbd>Space</kbd> — autocomplete game API in script editor</li>
      <li>Canvas: mouse wheel zoom, <kbd>Ctrl</kbd>+click pan, click-drag objects</li>
    </ul>
  </section>

  <section id="doc-workflow" class="docs-section">
    <h2>Recommended workflow</h2>
    <h3>Rooms &amp; level design</h3>
    <ul>
      <li>Each <strong>room</strong> has its own background, foreground layers, objects, walkable polygon, and hotspots.</li>
      <li><strong>Walkable area</strong>: Start Drawing → click vertices → Finish. Players pathfind only inside this polygon.</li>
      <li><strong>Hotspots</strong>: invisible (or debug-visible) click regions for doors, items, NPCs.</li>
      <li><strong>Scene objects</strong>: draggable images; position on canvas or via inspector.</li>
    </ul>
    <h3>Resources</h3>
    <p>Import images to the shared library, then use the resource picker in Rooms, GUI, Characters, etc. Keeps paths consistent and reduces duplicate uploads.</p>
    <h3>Characters</h3>
    <p><strong>Walking (standard):</strong> select animation <em>Walking</em>, upload frame sequences per direction (north, northeast, east, southeast, south, southwest, west, northwest). Frame 0 is the idle pose when the character is not moving; frames 1+ play during <code>walk_character</code>.</p>
    <p><strong>Custom animations:</strong> in the <strong>Animation</strong> dropdown choose <strong>+</strong> and enter a name (e.g. <code>wave</code>, <code>talk</code> — do not use <code>walking</code>, it is reserved). Assign frames per direction the same way as walking. Play them in scripts with <code>play_character_animation</code>.</p>
    <p>Set FPS for preview. Configure <strong>game start</strong>: starting character, room, and coordinates.</p>
    <h3>GUI &amp; cursors</h3>
    <p>GUI buttons can run scripts on click (<code>on_gui_click</code> in runtime). Contextual cursors change when hovering hotspots, objects, or characters.</p>
  </section>

  <section id="doc-scripting" class="docs-section">
    <h2>Scripting system</h2>
    <p>Scripts are <strong>JavaScript</strong> stored in the project and executed in an <strong>isolated sandbox</strong> during Play Test and in <code>runtime.html</code>.</p>
    <h3>Creating a script</h3>
    <ol>
      <li>Go to <strong>Scripts</strong>.</li>
      <li>Choose <strong>Scope</strong>: Global, Room, Object, Character, Hotspot, or GUI.</li>
      <li>Choose <strong>Target</strong> (room name, object id, etc.) — Global uses project-wide scope.</li>
      <li>Choose <strong>Event</strong> (e.g. <code>on_game_start</code>, <code>on_object_click</code>).</li>
      <li>Click <strong>Create Script</strong>, write code, <strong>Save</strong> (<kbd>Ctrl</kbd>+<kbd>S</kbd>).</li>
    </ol>
    <h3>Two ways to define handlers</h3>
    <p><strong>1. Named functions</strong> (matched by event name):</p>
    <pre class="docs-code"><code>function on_hotspot_click(hotspot_id) {
  print("Hotspot clicked: " + hotspot_id);
}</code></pre>
    <p><strong>2. Registration API</strong> (multiple handlers per event):</p>
    <pre class="docs-code"><code>on_game_start(function() {
  add_to_inventory("map", 1);
});

on_room_change(function(oldRoom, newRoom) {
  print("Room " + oldRoom + " -> " + newRoom);
});</code></pre>
    <h3>Game variables</h3>
    <p>Define variables in the Scripts panel. Use in code:</p>
    <pre class="docs-code"><code>Game.setVar("door_open", true);
if (Game.getVar("door_open")) {
  load_room("hall");
}</code></pre>
    <p>Aliases: <code>get_var</code>, <code>set_var</code>, <code>has_var</code>, <code>toggle_var</code>, and <code>GameAPI.getVariable</code> / <code>setVariable</code>.</p>
    <h3>Debugging</h3>
    <ul>
      <li><code>print(...)</code> — script log (Play Test / runtime console)</li>
      <li><code>GameAPI.error(...)</code> — error level log</li>
      <li><code>show_message(text)</code> — on-screen notification overlay</li>
      <li><strong>Test Game Start</strong> (PLAY tab) — runs <code>on_game_start</code> without full runtime UI</li>
    </ul>
  </section>

  <section id="doc-events" class="docs-section">
    <h2>Events reference</h2>
    <table class="docs-table">
      <thead><tr><th>Event</th><th>When it runs</th><th>Handler arguments</th></tr></thead>
      <tbody>
        <tr><td><code>on_game_start</code></td><td>Game / play test starts</td><td>none</td></tr>
        <tr><td><code>on_room_change</code></td><td>After changing room</td><td><code>oldRoomId</code>, <code>newRoomId</code></td></tr>
        <tr><td><code>on_object_click</code></td><td>Scene object clicked</td><td><code>objectId</code>, <code>x</code>, <code>y</code></td></tr>
        <tr><td><code>on_character_click</code></td><td>Character clicked</td><td><code>characterId</code></td></tr>
        <tr><td><code>on_hotspot_click</code></td><td>Hotspot clicked</td><td><code>hotspotId</code></td></tr>
        <tr><td><code>on_gui_click</code></td><td>GUI button clicked</td><td><code>buttonId</code>, <code>x</code>, <code>y</code></td></tr>
      </tbody>
    </table>
    <p><strong>Scope tips:</strong> Global scripts suit <code>on_game_start</code> and global <code>on_room_change</code>. Per-object scripts should define <code>on_object_click</code> only for that object. Hotspot scripts use hotspot scope + <code>on_hotspot_click</code>.</p>
  </section>

  <section id="doc-api" class="docs-section">
    <h2>Game API reference</h2>
    <p>Available in Play Test and standalone runtime unless noted. Use <kbd>Ctrl</kbd>+<kbd>Space</kbd> in the editor for autocomplete.</p>

    <h3>Logging &amp; UI</h3>
    <ul>
      <li><code>print(...)</code> — log to script console</li>
      <li><code>GameAPI.print(...)</code> / <code>GameAPI.error(...)</code></li>
      <li><code>show_message(text)</code> — player-facing message</li>
    </ul>

    <h3>Inventory</h3>
    <ul>
      <li><code>add_to_inventory(itemId, quantity?)</code></li>
      <li><code>remove_from_inventory(itemId, quantity?)</code></li>
      <li><code>has_item(itemId)</code> → boolean</li>
      <li><code>get_item_count(itemId)</code> → number</li>
      <li><code>clear_inventory()</code></li>
    </ul>

    <h3>Scene objects</h3>
    <ul>
      <li><code>spawn_object(nameOrId, x, y, imageUrlOrDataUrl?)</code></li>
      <li><code>despawn_object(objectId)</code></li>
      <li><code>move_object(objectId, x, y)</code></li>
      <li><code>rotate_object(objectId, degrees)</code></li>
      <li><code>scale_object(objectId, scaleX, scaleY)</code></li>
      <li><code>set_object_visible(objectId, visible)</code></li>
      <li><code>enableObject(id)</code> / <code>disableObject(id)</code></li>
    </ul>

    <h3>Rooms</h3>
    <ul>
      <li><code>load_room(roomIdOrName, playerX?, playerY?, playerDirection?)</code></li>
      <li><code>get_current_room()</code></li>
      <li><code>get_room_objects()</code> → array of plain objects</li>
      <li><code>set_room_background(imageUrlOrDataUrl)</code> — empty string clears</li>
    </ul>

    <h3>Characters</h3>
    <ul>
      <li><code>spawn_character(name, x, y, direction?, id?)</code> — spawns in current room; returns character id</li>
      <li><code>move_character(idOrName, x, y)</code> — instant teleport</li>
      <li><code>walk_character(idOrName, x, y, wait?)</code> — pathfinding on walkable area; <code>wait</code> default true → Promise; stops custom animation if playing</li>
      <li><code>set_character_direction(idOrName, direction)</code> — facing: <code>north</code>, <code>northeast</code>, <code>east</code>, <code>southeast</code>, <code>south</code>, <code>southwest</code>, <code>west</code>, <code>northwest</code></li>
      <li><code>play_character_animation(idOrName, animationName, direction, wait?)</code> — plays one full cycle of a <strong>custom</strong> animation defined in the editor (<strong>Characters</strong> → Animation → <strong>+</strong>). Uses <code>characterDefinitions.animations[animationName]</code>. Stops movement; when finished returns to walking idle. <code>wait</code> default true → blocks input until done (like <code>walk_character</code>).</li>
      <li><code>animate_character(idOrName, enabled?)</code> — reserved hook</li>
    </ul>
    <p><strong>Directions</strong> are string names, not numbers. <strong>Custom animation names</strong> must match the label you created in the Characters tab (case-sensitive).</p>

    <h3>Variables</h3>
    <ul>
      <li><code>get_var(key)</code> / <code>set_var(key, value)</code> / <code>has_var(key)</code> / <code>toggle_var(key)</code></li>
      <li><code>Game.getVar(key)</code> / <code>Game.setVar(key, value)</code> / <code>Game.hasVar(key)</code> / <code>Game.toggleVar(key)</code></li>
    </ul>
  </section>

  <section id="doc-examples" class="docs-section">
    <h2>Practical examples</h2>

    <h3>1 — Intro and starting inventory</h3>
    <pre class="docs-code"><code>function on_game_start() {
  print("Game started");
  show_message("Find the key and unlock the door.");
  if (!has_item("torch")) {
    add_to_inventory("torch", 1);
  }
}</code></pre>

    <h3>2 — Pick up an object (one-time)</h3>
    <pre class="docs-code"><code>// Attach to scene object scope, event on_object_click
function on_object_click(object_id, x, y) {
  if (Game.getVar("key_taken")) return;
  add_to_inventory("brass_key", 1);
  set_object_visible(object_id, false);
  Game.setVar("key_taken", true);
  show_message("You picked up a brass key.");
}</code></pre>

    <h3>3 — Door hotspot (needs key)</h3>
    <pre class="docs-code"><code>function on_hotspot_click(hotspot_id) {
  if (hotspot_id !== "door_exit") return;
  if (!has_item("brass_key")) {
    show_message("The door is locked.");
    return;
  }
  load_room("garden", 400, 300, 2);
}</code></pre>

    <h3>4 — Room entry cutscene flag</h3>
    <pre class="docs-code"><code>on_room_change(function(oldRoom, newRoom) {
  if (newRoom === "cellar" && !Game.getVar("cellar_visited")) {
    show_message("The air smells damp...");
    Game.setVar("cellar_visited", true);
  }
});</code></pre>

    <h3>5 — Walk player to click, then talk</h3>
    <pre class="docs-code"><code>function on_character_click(character_id) {
  const playerId = Game.getVar("playerId");
  if (!playerId) return;
  walk_character(playerId, 320, 240, true).then(function() {
    show_message("Hello, traveler!");
  });
}</code></pre>

    <h3>5b — Custom animation (e.g. wave)</h3>
    <p>Requires a custom animation named <code>wave</code> with frames for the chosen direction, created under <strong>Characters</strong> → Animation → <strong>+</strong>.</p>
    <pre class="docs-code"><code>async function on_hotspot_click(hotspot_id) {
  if (hotspot_id !== "npc_greet") return;
  await play_character_animation("Hero", "wave", "south");
  show_message("The hero waves hello!");
}</code></pre>

    <h3>6 — Spawn temporary object</h3>
    <pre class="docs-code"><code>function on_hotspot_click(hotspot_id) {
  if (hotspot_id === "sparkle") {
    spawn_object("glint", 150, 200, "asset:fx_sparkle");
    setTimeout(function() {
      despawn_object("glint");
    }, 2000);
  }
}</code></pre>

    <h3>7 — GUI inventory button</h3>
    <pre class="docs-code"><code>// GUI button script — on_gui_click
function on_gui_click(button_id, x, y) {
  if (button_id === "btn_use_key") {
    if (has_item("brass_key")) {
      show_message("You ready the key.");
      Game.setVar("key_ready", true);
    } else {
      show_message("You have no key.");
    }
  }
}</code></pre>

    <h3>8 — Puzzle with variables</h3>
    <pre class="docs-code"><code>function on_object_click(object_id) {
  if (object_id === "lever_a") {
    Game.setVar("lever_a", !Game.getVar("lever_a"));
  }
  if (object_id === "lever_b") {
    Game.setVar("lever_b", !Game.getVar("lever_b"));
  }
  if (Game.getVar("lever_a") && Game.getVar("lever_b")) {
    set_object_visible("gate_open", true);
    show_message("The gate opens!");
  }
}</code></pre>
  </section>

  <section id="doc-playtest" class="docs-section">
    <h2>Play test &amp; export</h2>
    <ul>
      <li><strong>Start Test</strong> — embedded runtime with rendering, clicks, pathfinding, scripts.</li>
      <li><strong>Script console</strong> — shows <code>print</code> / errors from sandbox.</li>
      <li><strong>Export</strong> — File menu → Export project JSON for <code>runtime.html</code>.</li>
      <li>Standalone runtime: load JSON file or last saved; scripts use the same API bindings as Play Test.</li>
    </ul>
    <p>Sandbox uses <code>sandbox="allow-scripts"</code> — scripts cannot access the parent DOM; only the exposed game API.</p>
  </section>

  <section id="doc-tips" class="docs-section">
    <h2>Tips &amp; troubleshooting</h2>
    <ul>
      <li>Save scripts often (<kbd>Ctrl</kbd>+<kbd>S</kbd>). Unsaved changes are lost when switching scripts.</li>
      <li>Use meaningful script names in the tree — easier to find than generic "script1".</li>
      <li><code>print</code> duplicate suppression: rapid identical messages may be throttled in runtime logs.</li>
      <li>If a tab is disabled, open or create a project from <strong>Projects</strong> first (Docs is always open).</li>
      <li>Object/hotspot IDs in scripts must match the editor IDs (check lists in Rooms tab).</li>
      <li>Room IDs/names: <code>load_room</code> accepts either — prefer the same string you use in the Rooms manager.</li>
      <li><code>play_character_animation</code> only works for animations you added with <strong>+</strong> in Characters (not the built-in walking cycle).</li>
      <li>Features on roadmap (not in runtime yet): dialogue system, audio API, save slots, fade transitions — see <code>ROADMAP.md</code>.</li>
    </ul>
  </section>
</article>`;

  function scrollDocsToHash(hash, behavior) {
    const panel = document.getElementById('docs-main-content');
    if (!panel || !hash) return;
    const id = hash.replace(/^#/, '');
    const el = panel.querySelector('#' + CSS.escape(id));
    if (el) el.scrollIntoView({ behavior: behavior || 'smooth', block: 'start' });
  }

  function initDocsToc() {
    const nav = document.getElementById('docs-toc-nav');
    const panel = document.getElementById('docs-main-content');
    if (!nav || !panel) return;

    nav.querySelectorAll('.docs-toc-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;
        scrollDocsToHash(href, 'smooth');
        if (history.replaceState) {
          history.replaceState(null, '', href);
        }
      });
    });

    panel.addEventListener('scroll', function () {
      const sections = panel.querySelectorAll('.docs-section[id]');
      let activeId = null;
      const top = panel.scrollTop + 24;
      sections.forEach(function (sec) {
        if (sec.offsetTop <= top) activeId = sec.id;
      });
      nav.querySelectorAll('.docs-toc-link').forEach(function (link) {
        const href = link.getAttribute('href') || '';
        link.classList.toggle('active', href === '#' + activeId);
      });
    });
  }

  function initDocsPanel() {
    const container = document.getElementById('docs-main-content');
    if (!container || container.dataset.docsLoaded === '1') return;
    container.innerHTML = DOCS_HTML;
    container.dataset.docsLoaded = '1';
    initDocsToc();
    if (location.hash && location.hash.startsWith('#doc-')) {
      setTimeout(function () { scrollDocsToHash(location.hash, 'auto'); }, 100);
    }
  }

  document.addEventListener('DOMContentLoaded', initDocsPanel);

  window.amiantoDocs = {
    init: initDocsPanel,
    scrollTo: scrollDocsToHash
  };
})();
