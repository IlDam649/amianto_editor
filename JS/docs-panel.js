/**
 * In-app documentation for Amianto Editor and scripting API.
 */
(function () {
  'use strict';

  const DOCS_HTML = `
<article class="docs-article">
  <section id="doc-overview" class="docs-section">
    <h2>Overview</h2>
    <p><strong>Amianto Editor</strong> is an offline point-and-click adventure game editor (Windows Electron app or browser). You build rooms, place interactive objects, define walkable areas and hotspots, manage characters and inventory, design GUI overlays, and drive game logic with <strong>JavaScript</strong> scripts executed in a sandboxed runtime.</p>
    <ul>
      <li><strong>Editor</strong> (<code>index.html</code>) — design projects; save as <code>.amnt</code> files.</li>
      <li><strong>Runtime (Play Test window)</strong> (<code>runtime.html</code> + <code>JS/runtime.js</code>) — full-screen test player.</li>
      <li><strong>Script sandbox (in editor)</strong> (<code>runtime-sandbox.html</code> + <code>JS/runtime.js</code>) — isolated iframe for script execution with the same API.</li>
    </ul>
    <p>Open or create a project from <strong>Projects</strong> before using design tabs. Use <strong>Save Project</strong> (header) to write the <code>.amnt</code> file. <strong>Docs</strong> is always available without a project.</p>
  </section>

  <section id="doc-quickstart" class="docs-section">
    <h2>Quick start</h2>
    <ol>
      <li><strong>Projects</strong> → create (pick <code>.amnt</code> save path) or <strong>Load Project</strong>.</li>
      <li><strong>Rooms</strong> — create a room, add background, scene objects, walkable polygon, hotspots; place <strong>room animations</strong> (see <strong>Animations</strong> tab).</li>
      <li><strong>Animations</strong> — create looping frame sequences for background or foreground layers; preview on canvas.</li>
      <li><strong>Characters</strong> — create the player, upload <strong>walking</strong> frames (8 directions), add optional <strong>custom animations</strong> (e.g. <code>wave</code>), set start room/position.</li>
      <li><strong>Inventory</strong> — define items (keys, tools, etc.).</li>
      <li><strong>Scripts</strong> — write <code>on_game_start</code>, attach scripts to objects/hotspots/GUI.</li>
      <li><strong>Dialogues</strong> — branching conversations (Form or Visual graph); call with <code>start_dialogue</code>.</li>
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
        <tr><td><strong>Projects</strong></td><td>Create <code>.amnt</code> projects, load from disk, manage local project list.</td></tr>
        <tr><td><strong>Resources</strong></td><td>Central image/sound library (local storage). Import once, pick assets everywhere.</td></tr>
        <tr><td><strong>Rooms</strong></td><td>Rooms manager, background, foreground layers, <strong>room animation placements</strong>, scene objects, walkable area, hotspots.</td></tr>
        <tr><td><strong>Inventory</strong></td><td>Inventory items and slot grid for the player UI.</td></tr>
        <tr><td><strong>Characters</strong></td><td>Walking animation + named custom animations (8 directions each), FPS, preview; game start spawn settings.</td></tr>
        <tr><td><strong>Animations</strong></td><td>Room/environment animations: frame sequences, FPS, layer (background/foreground), loop default, canvas preview.</td></tr>
        <tr><td><strong>GUI</strong></td><td>Overlay screens (menus), <strong>DialogBox</strong> (speech balloons), <strong>SaveLoad</strong> (drawable save slots), buttons with optional scripts. Inventory layout is in the Inventory tab.</td></tr>
        <tr><td><strong>GUI</strong></td><td>Buttons, overlays, dialogue balloon settings.</td></tr>
        <tr><td><strong>Cursors</strong></td><td>One cursor image per interaction category; click-point pivot on the canvas.</td></tr>
        <tr><td><strong>Scripts</strong></td><td>CodeMirror editor, script tree, game variables, Run/Stop sandbox.</td></tr>
        <tr><td><strong>Dialogues</strong></td><td>Branching dialogue graphs (Form + Visual node editor); same <code>project.dialogues</code> data for both modes.</td></tr>
        <tr><td><strong>Docs</strong></td><td>This guide.</td></tr>
        <tr><td><strong>PLAY</strong></td><td>Live play test with script console and debug tools.</td></tr>
      </tbody>
    </table>
    <h3>Keyboard shortcuts</h3>
    <ul>
      <li><kbd>Ctrl</kbd>+<kbd>0</kbd> Projects · <kbd>1</kbd> Resources · <kbd>2</kbd> Rooms · <kbd>3</kbd> Inventory · <kbd>4</kbd> Characters · <kbd>5</kbd> Animations · <kbd>6</kbd> GUI · <kbd>7</kbd> Cursors · <kbd>8</kbd> Docs · <kbd>9</kbd> PLAY</li>
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
      <li><strong>Hotspots</strong>: polygon click regions for doors, items, NPCs. Use <strong>Is active?</strong> for the default state; toggle at runtime with <code>enableHotspot</code> / <code>disableHotspot</code>.</li>
      <li><strong>Scene objects</strong>: draggable images; position on canvas or via inspector.</li>
      <li><strong>Room animations</strong>: create definitions in <strong>Animations</strong>, then in <strong>Rooms → Room Animations</strong> add an instance and drag the first frame on the canvas. <strong>Background</strong> layer draws behind scene objects; <strong>foreground</strong> layer draws in front.</li>
    </ul>
    <h3>Animations (room / environment)</h3>
    <p>Unlike <strong>Characters</strong> (8-direction walking), room animations are a single frame strip for props and ambience (water, fire, flags, etc.).</p>
    <ol>
      <li><strong>Animations</strong> → <strong>Add Animation</strong> → name, upload frames from <strong>Resources</strong>, set FPS and default layer.</li>
      <li><strong>Start Preview</strong> to test on the canvas; enable <strong>Loop by default</strong> for ambient effects.</li>
      <li><strong>Rooms</strong> → <strong>Room Animations</strong> → pick animation → <strong>Add Animation to Room</strong> → drag to position.</li>
      <li>In play test, animations show frame 0 until you call <code>play_animation</code> / <code>stop_animation</code> in scripts.</li>
    </ol>
    <p>Instance <code>name</code> (e.g. <code>waterfall_room1</code>) is what you pass to <code>play_animation</code>. Saved in project JSON as <code>roomAnimations[]</code> (catalog) and <code>rooms[].animationInstances[]</code> (placements).</p>
    <h3>Resources</h3>
    <p>Import images to the shared library, then use the resource picker in Rooms, GUI, Characters, etc. Keeps paths consistent and reduces duplicate uploads.</p>
    <h3>Characters</h3>
    <p><strong>Walking (standard):</strong> select animation <em>Walking</em>, upload frame sequences per direction (north, northeast, east, southeast, south, southwest, west, northwest). Frame 0 is the idle pose when the character is not moving; frames 1+ play during <code>walk_character</code>.</p>
    <p><strong>Custom animations:</strong> in the <strong>Animation</strong> dropdown choose <strong>+</strong> and enter a name (e.g. <code>wave</code>, <code>talk</code> — do not use <code>walking</code>, it is reserved). Assign frames per direction the same way as walking. Play them in scripts with <code>play_character_animation</code>.</p>
    <p>Set FPS for preview. Configure <strong>game start</strong>: starting character, room, and coordinates.</p>
    <h3>GUI &amp; cursors</h3>
    <p>GUI buttons can run scripts on click (<code>on_gui_click</code> in runtime). Create a <strong>DialogBox</strong> GUI to configure speech balloons (colors, optional balloon image, appear effect). In scripts use <code>show_dialogue(character, text)</code> — the balloon follows the speaking character.</p>
    <p>In the <strong>Cursors</strong> tab define one cursor per interaction category (<code>default</code>, <code>look</code>, <code>use</code>, <code>talk</code>, <code>grab</code>, <code>exit</code>, <code>walk</code>, <code>wait</code>, <code>inactive</code>) — not per object or hotspot. Click the canvas preview to set the <strong>click point</strong> (pivot). Optional <strong>Action Text</strong> per category; enable <strong>Show action text on hover</strong> to display it in Play Test / exported games (off by default). Runtime hover picks: inventory → <code>grab</code>, GUI → <code>use</code>, hotspot → <code>use</code>/<code>exit</code>, object → <code>use</code>, character → <code>talk</code>, walkable area → <code>walk</code>, input lock → <code>wait</code>.</p>
  </section>

  <section id="doc-scripting" class="docs-section">
    <h2>Scripting system</h2>
    <p>Scripts are <strong>JavaScript</strong> stored in the project and executed in an <strong>isolated sandbox</strong> during Play Test and in <code>runtime.html</code>.</p>
    <h3>Creating a script</h3>
    <ol>
      <li>Go to <strong>Scripts</strong>.</li>
      <li>Choose <strong>Scope</strong>: Global, Room, Object, Character, <strong>Inventory</strong>, Hotspot, or GUI.</li>
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

on_before_room_change(function(oldRoom, newRoom) {
  print("Leaving " + oldRoom + ", loading " + newRoom);
});

on_room_change(function(oldRoom, newRoom) {
  print("Room loaded: " + newRoom);
});</code></pre>
    <h3>Game variables</h3>
    <p>Define variables in the Scripts panel. Use in code:</p>
    <pre class="docs-code"><code>Game.setVar("door_open", true);
if (Game.getVar("door_open")) {
  load_room("hall");
}</code></pre>
    <p>Aliases: <code>get_var</code>, <code>set_var</code>, <code>has_var</code>, <code>toggle_var</code>, and <code>GameAPI.getVariable</code> / <code>setVariable</code>.</p>
    <h3>Debugging &amp; timing</h3>
    <ul>
      <li><code>print(...)</code> — script log (Play Test / runtime console)</li>
      <li><code>GameAPI.error(...)</code> — error level log</li>
      <li><code>wait(ms)</code> — pause for a fixed time in milliseconds; use with <code>await</code> in <code>async</code> handlers (e.g. <code>await wait(1500)</code>)</li>
      <li><code>show_message(text)</code> — on-screen notification; blocks following commands until closed (× or ~3s)</li>
      <li><code>show_dialogue(character, text)</code> — speech balloon; blocks until click to close</li>
      <li><code>start_dialogue(idOrName)</code> — branching dialogue from the Dialogues tab</li>
      <li><strong>Test Game Start</strong> (PLAY tab) — runs <code>on_game_start</code> without full runtime UI</li>
    </ul>
    <pre class="docs-code"><code>async function on_game_start() {
  show_message("Something happens...");
  await wait(2000);
  hide_animation("secret_eye");
}</code></pre>
  </section>

  <section id="doc-events" class="docs-section">
    <h2>Events reference</h2>
    <table class="docs-table">
      <thead><tr><th>Event</th><th>When it runs</th><th>Handler arguments</th></tr></thead>
      <tbody>
        <tr><td><code>on_game_start</code></td><td>Game / play test starts</td><td>none</td></tr>
        <tr><td><code>on_before_room_change</code></td><td>Before the new room loads (previous room still active). Also runs when entering via <code>load_room</code>.</td><td><code>oldRoomId</code>, <code>newRoomId</code></td></tr>
        <tr><td><code>on_room_change</code></td><td>After the new room is loaded and the player is placed (including via <code>load_room</code>). Prefer this to show/hide the player on arrival.</td><td><code>oldRoomId</code>, <code>newRoomId</code></td></tr>
        <tr><td><code>on_object_click</code></td><td>Scene object clicked</td><td><code>objectId</code>, <code>x</code>, <code>y</code>, <code>usedItemId?</code></td></tr>
        <tr><td><code>on_character_click</code></td><td>Character clicked</td><td><code>characterId</code>, <code>x</code>, <code>y</code>, <code>usedItemId?</code></td></tr>
        <tr><td><code>on_hotspot_click</code></td><td>Hotspot clicked</td><td><code>hotspotId</code>, <code>x</code>, <code>y</code>, <code>usedItemId?</code></td></tr>
        <tr><td><code>on_gui_click</code></td><td>GUI button clicked</td><td><code>buttonId</code>, <code>x</code>, <code>y</code></td></tr>
        <tr><td><code>on_use_with</code></td><td><strong>Inventory item script</strong> — use on a target</td><td><code>targetType</code>, <code>targetId</code>, <code>x</code>, <code>y</code> — return <code>true</code> if handled</td></tr>
        <tr><td><code>on_inventory_use_with</code></td><td><strong>Global</strong> fallback (any item); also accepted as alias on item scripts</td><td><code>itemId</code>, <code>targetType</code>, <code>targetId</code>, <code>x</code>, <code>y</code></td></tr>
        <tr><td><code>on_dialogue_action</code></td><td>Inline <code>run_script</code> action in Dialogues → Visual inspector</td><td><code>dialogueId</code>, <code>nodeId</code>, <code>optionId?</code></td></tr>
        <tr><td><code>on_dialogue_preview</code></td><td>Fired by Visual editor <strong>Preview</strong> button (Play Test)</td><td>none — calls <code>start_dialogue</code></td></tr>
      </tbody>
    </table>
    <p><strong>Scope tips:</strong> <strong>Inventory</strong> item scripts must define <code>on_use_with</code> (not <code>on_inventory_use_with</code>, except as legacy alias). Global scripts use <code>on_inventory_use_with</code> for all items. Always <code>return true</code> on success.</p>
  </section>

  <section id="doc-api" class="docs-section">
    <h2>Game API reference</h2>
    <p>Available in Play Test and standalone runtime unless noted. Use <kbd>Ctrl</kbd>+<kbd>Space</kbd> in the script editor for autocomplete (aligned with <code>getScriptApiBindings()</code> in <code>runtime.js</code>, including <code>Game.</code> and <code>GameAPI.</code> members).</p>

    <h3>Logging &amp; UI</h3>
    <ul>
      <li><code>print(...)</code> — log to script console</li>
      <li><code>GameAPI.print(...)</code> / <code>GameAPI.error(...)</code></li>
      <li><code>show_message(text)</code> — fixed notification overlay; blocks subsequent script commands until dismissed (×) or ~3s. Auto-<code>await</code> injected at compile time.</li>
      <li><code>show_dialogue(character, text)</code> — speech balloon above a character (two args required). Click to dismiss; blocks subsequent commands until closed. In <code>on_room_change</code> / <code>on_before_room_change</code> it does <strong>not</strong> block <code>load_room</code> (balloon still shows after the room is ready).</li>
      <li><code>show_dialogue_text(text, speaker)</code> — same as <code>show_dialogue(speaker, text)</code></li>
      <li><code>start_dialogue(dialogueIdOrName)</code> — branching graph from the <strong>Dialogues</strong> tab (Form or Visual; nodes: <code>line</code>, <code>choice</code>, <code>jump</code>, <code>action</code>, <code>end</code>). Blocks subsequent script commands until the dialogue ends. In room-change scripts does not block <code>load_room</code>.</li>
      <li><code>end_dialogue()</code> — close the active balloon and abort any running <code>start_dialogue</code> session</li>
      <li><code>save_game(slot?, label?)</code> — save player state (room, variables, inventory, characters, objects/hotspots, dialogue once-only) to <code>localStorage</code> (slots 1–10 or string). Not stored in <code>.amnt</code>. Quota-limited by the browser.</li>
      <li><code>load_game(slot?)</code> — restore a save; does not re-fire <code>on_game_start</code> / <code>on_room_change</code></li>
      <li><code>delete_save(slot)</code> — delete a slot (<strong>slot required</strong>). <code>get_save_info(slot?)</code> — inspect one slot or list all for this project</li>
      <li><code>show_gui(idOrName)</code> / <code>hide_gui(idOrName)</code> — show/hide a GUI overlay (use with type <strong>SaveLoad</strong> menus)</li>
    </ul>
    <p><strong>SaveLoad GUI:</strong> in the GUI tab set type <strong>SaveLoad</strong>, draw save slots (like inventory slots), set mode (save / load / both). Hidden at start by default — open with <code>show_gui("My Save Menu")</code>. Empty slot + mode both/save → saves; filled + both/load → loads. Optional Close button with <code>hide_gui</code> in <code>on_gui_click</code>.</p>

    <h3>Inventory</h3>
    <ul>
      <li><code>add_to_inventory(itemId, quantity?)</code></li>
      <li><code>remove_from_inventory(itemId, quantity?)</code></li>
      <li><code>has_item(itemId)</code> → boolean</li>
      <li><code>get_item_count(itemId)</code> → number</li>
      <li><code>clear_inventory()</code></li>
      <li><code>get_carried_item()</code> → item id in hand, or <code>null</code></li>
      <li><code>set_carried_item(itemId)</code> → select item for use-with (returns boolean)</li>
      <li><code>clear_carried_item()</code> — deselect item in hand</li>
    </ul>
    <p><strong>Use-with flow:</strong> click an inventory slot to pick up an item, then click a hotspot, scene object, character, or another inventory item. Handlers run in order: (1) item script <code>on_use_with</code>, (2) global <code>on_inventory_use_with</code>, (3) target script with optional 4th arg <code>usedItemId</code>. Return <code>true</code> from a handler to confirm the combination (item is deselected). Failed combinations show <em>That doesn't work.</em> and keep the item selected. Press <kbd>Esc</kbd>, right-click, click empty space, or click the same slot to cancel.</p>
    <p><code>targetType</code> values: <code>hotspot</code>, <code>object</code>, <code>character</code>, <code>inventory</code>.</p>

    <h3>Scene objects</h3>
    <ul>
      <li><code>spawn_object(nameOrId, x, y, imageUrlOrDataUrl?)</code> — 4th arg: <code>asset:…</code>, URL, or Resources file name (e.g. <code>chiave.png</code>)</li>
      <li><code>despawn_object(objectId)</code></li>
      <li><code>move_object(objectId, x, y)</code></li>
      <li><code>rotate_object(objectId, degrees)</code></li>
      <li><code>scale_object(objectId, scaleX, scaleY)</code></li>
      <li><code>set_object_visible(objectId, visible)</code></li>
      <li><code>enableObject(id)</code> / <code>disableObject(id)</code></li>
    </ul>

    <h3>Hotspots</h3>
    <ul>
      <li><code>enableHotspot(idOrName)</code> — makes a hotspot clickable in the current room (sets <code>visible</code> to true)</li>
      <li><code>disableHotspot(idOrName)</code> — disables clicks on that hotspot (sets <code>visible</code> to false)</li>
    </ul>
    <p>In the <strong>Rooms</strong> tab, the <strong>Is active?</strong> checkbox on each hotspot sets the initial state saved in the project. Scripts can change it at runtime. Hotspots are always drawn in the editor; only playtest/runtime respect active state.</p>

    <h3>Rooms</h3>
    <ul>
      <li><code>load_room(roomIdOrName, playerX?, playerY?, playerDirection?)</code> — runs destination <strong>Before</strong> scripts, then loads the room, places the player, then runs <strong>After</strong> scripts</li>
      <li><code>get_current_room()</code></li>
      <li><code>get_room_objects()</code> → array of plain objects</li>
      <li><code>set_room_background(imageUrlOrDataUrl)</code> — empty string clears</li>
    </ul>

    <h3>Characters</h3>
    <ul>
      <li><code>spawn_character(name, x, y, direction?, id?)</code> — spawns in current room; <strong>id = name</strong> (editor + runtime)</li>
      <li><code>move_character(idOrName, x, y)</code> — instant teleport</li>
      <li><code>spawn_character(name, x, y, direction?)</code> — spawns a character; <strong>runtime id is always equal to name</strong> (use the name in scripts / <code>Game.getVar("playerId")</code>)</li>
      <li><code>walk_character(idOrName, x, y, wait?)</code> — pathfinding on walkable area; <code>wait</code> default true → Promise; stops custom animation if playing. Pass the character <strong>name</strong> (same as id).</li>
      <li><code>set_character_direction(idOrName, direction)</code> — facing: <code>north</code>, <code>northeast</code>, <code>east</code>, <code>southeast</code>, <code>south</code>, <code>southwest</code>, <code>west</code>, <code>northwest</code></li>
      <li><code>set_character_visibility(idOrName, visible)</code> — show/hide character (<code>true</code>/<code>false</code>); hidden characters are not clickable. Safe in <code>on_game_start</code> (loading overlay stays until scripts finish).</li>
      <li><code>set_character_opacity(idOrName, opacity)</code> — draw opacity <code>0</code>–<code>1</code> (e.g. <code>0.5</code>); at <code>0</code> not clickable</li>
      <li><code>play_character_animation(idOrName, animationName, direction, wait?)</code> — plays one full cycle of a <strong>custom</strong> animation defined in the editor (<strong>Characters</strong> → Animation → <strong>+</strong>). Uses <code>characterDefinitions.animations[animationName]</code>. Stops movement; when finished returns to walking idle. <code>wait</code> default true → blocks input until done (like <code>walk_character</code>).</li>
      <li><code>animate_character(idOrName, enabled?)</code> — reserved hook</li>
    </ul>
    <p><strong>Directions</strong> are string names, not numbers. <strong>Custom animation names</strong> must match the label you created in the Characters tab (case-sensitive).</p>

    <h3>Variables</h3>
    <ul>
      <li><code>get_var(key)</code> / <code>set_var(key, value)</code> / <code>has_var(key)</code> / <code>toggle_var(key)</code></li>
      <li><code>Game.getVar(key)</code> / <code>Game.setVar(key, value)</code> / <code>Game.hasVar(key)</code> / <code>Game.toggleVar(key)</code></li>
    </ul>

    <h3>Audio</h3>
    <p>Import MP3/OGG/WAV in <strong>Resources → Audio</strong>. Reference by file name (<code>theme.mp3</code>), display name, asset id, or <code>asset:…</code>.</p>
    <ul>
      <li><code>play_music(trackId)</code> — background music in infinite loop (one track at a time). Keeps playing across rooms/clicks until <code>stop_music()</code>.</li>
      <li><code>play_sound(soundId, loop?)</code> — sound effect (can overlap). Default loop: <code>false</code>.</li>
      <li><code>stop_music()</code> — stop background music</li>
      <li><code>stop_sound(soundId?)</code> — stop a looping SFX, or all looping SFX if omitted</li>
    </ul>
    <p><strong>SFX loop parameter:</strong> <code>true</code> / <code>'loop'</code> / <code>'infinite'</code> = repeat forever; <code>false</code> / <code>'once'</code> = play once; number <code>N</code> &gt; 1 = play N times. Music always loops until <code>stop_music()</code>.</p>
    <pre class="docs-code"><code>function on_game_start() {
  play_music("theme.mp3");
}

function on_hotspot_click() {
  play_sound("door_open.ogg", false);
}</code></pre>

    <h3>Room animations</h3>
    <p>Create animations in <strong>Animations</strong>, place them in <strong>Rooms → Room Animations</strong>, then control them from script.</p>
    <ul>
      <li><code>play_animation(instanceIdOrName, loop?, waitForCompletion?)</code> — start or restart a placed room animation. With <code>loop</code> once or a number (e.g. <code>2</code>), use <code>await</code> to wait for completion before the next line. Pass <code>false</code> as 3rd arg to fire-and-forget.</li>
      <li><code>stop_animation(instanceIdOrName?)</code> — stop one instance, or all room animations if omitted</li>
      <li><code>show_animation(instanceIdOrName)</code> — show a hidden animation instance</li>
      <li><code>hide_animation(instanceIdOrName?)</code> — hide one instance (and stop playback), or all if omitted</li>
    </ul>
    <p><strong>Editor setup:</strong> Animations tab → frames + layer; Rooms tab → placement + drag first frame. In play test, animations stay on frame 0 until you call <code>play_animation()</code> from script.</p>
    <pre class="docs-code"><code>async function on_game_start() {
  show_animation("occhio_stanza1");
  await play_animation("occhio_stanza1", 2);
  hide_animation("occhio_stanza1");
}

function on_before_room_change(oldRoom, newRoom) {
  // fade out, stop music, etc. — old room still visible
}

function on_room_change(oldRoom, newRoom) {
  play_animation("waterfall_room1", true, false); // loop forever, don't block script
}

function on_hotspot_click() {
  play_animation("torch_flicker", false);
  stop_animation("waterfall_room1");
  hide_animation("secret_glow");
  show_animation("waterfall_room1");
}</code></pre>
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

    <h3>3b — Enable a hotspot after a puzzle</h3>
    <pre class="docs-code"><code>// Room scope: lever object — on_object_click
function on_object_click(object_id) {
  if (object_id !== "lever") return;
  if (Game.getVar("bridge_lowered")) return;
  Game.setVar("bridge_lowered", true);
  enableHotspot("bridge_crossing");
  show_message("The bridge lowers.");
}

// Hotspot "bridge_crossing" starts inactive (Is active? unchecked in Rooms tab)</code></pre>

    <h3>4 — Room entry cutscene flag</h3>
    <pre class="docs-code"><code>function on_before_room_change(oldRoom, newRoom) {
  if (newRoom === "cellar") {
    show_message("You hear dripping water...");
  }
}

on_room_change(function(oldRoom, newRoom) {
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
    show_dialogue(character_id, "Hello, traveler!");
  });
}</code></pre>

    <h3>5a — NPC dialogue line</h3>
    <p>Add a <strong>DialogBox</strong> GUI in the GUI tab (balloon image optional). Character must exist in the current room (spawned or placed).</p>
    <pre class="docs-code"><code>function on_character_click(character_id) {
  show_dialogue(character_id, "I have been waiting for you.");
}

// Multiple lines (sequential queue):
function on_character_click(character_id) {
  show_dialogue(character_id, "First line.");
  show_dialogue(character_id, "Second line — click after each.");
}</code></pre>

    <h3>5a2 — Branching dialogue (<code>start_dialogue</code>)</h3>
    <p>Create a dialogue in the <strong>Dialogues</strong> tab using <strong>Form</strong> or <strong>Visual</strong> mode (same <code>project.dialogues</code> data). Nodes: <code>line</code>, <code>choice</code>, <code>jump</code>, <code>action</code>, <code>end</code>. The Visual editor stores layout in <code>node.ui</code> (ignored by runtime). Choices support <em>Once only</em>, declarative conditions (<code>has_item</code>, <code>var</code>, <code>and</code>/<code>or</code>/<code>not</code>), and actions. Speakers must match character names/ids. Then:</p>
    <pre class="docs-code"><code>function on_character_click(character_id) {
  start_dialogue("New Dialogue"); // name or id from Dialogues list
}
// Example choice condition: {"type":"has_item","itemId":"brass_key"}
// Example var condition: {"type":"var","key":"met_npc","op":"truthy"}
// once: true → consumed for the playthrough and stored in save_game</code></pre>

    <h3>5a3 — Save / load game</h3>
    <p>Player saves use browser <code>localStorage</code> per project id (playtest + standalone HTML). Separate from editor <strong>Save Project</strong> / <code>.amnt</code>. Subject to browser storage quota. Format <code>amianto-save</code> v1 includes <code>dialogueConsumed</code> for once-only choices.</p>
    <pre class="docs-code"><code>function on_gui_click(button_id) {
  if (button_id === "btn_save") {
    save_game(1, "Checkpoint");
    show_message("Game saved.");
  }
  if (button_id === "btn_load") {
    load_game(1).then(function(result) {
      if (result && result.ok) show_message("Game loaded.");
      else show_message("No save found.");
    });
  }
}

// List slots:
print(get_save_info());</code></pre>

    <h3>5b — Custom animation (e.g. wave)</h3>
    <p>Requires a custom animation named <code>wave</code> with frames for the chosen direction, created under <strong>Characters</strong> → Animation → <strong>+</strong>.</p>
    <pre class="docs-code"><code>async function on_hotspot_click(hotspot_id) {
  if (hotspot_id !== "npc_greet") return;
  await play_character_animation("Hero", "wave", "south");
  show_message("The hero waves hello!");
}</code></pre>

    <h3>5c — Room animation (waterfall, torch, etc.)</h3>
    <p>Create the animation in <strong>Animations</strong>, place it in <strong>Rooms → Room Animations</strong>, then reference the instance <strong>name</strong> in script. Use <code>on_room_change</code> (after load) to start ambient loops.</p>
    <pre class="docs-code"><code>function on_room_change(oldRoom, newRoom) {
  if (newRoom === "cave") {
    play_animation("waterfall_cave", true);
  } else {
    stop_animation("waterfall_cave");
  }
}

function on_hotspot_click(hotspot_id) {
  if (hotspot_id === "torch_switch") {
    play_animation("wall_torch", 1); // play once
  }
}</code></pre>

    <h3>6 — Spawn temporary object</h3>
    <pre class="docs-code"><code>async function on_hotspot_click(hotspot_id) {
  if (hotspot_id === "sparkle") {
    spawn_object("glint", 150, 200, "sparkle.png");
    await wait(2000);
    despawn_object("glint");
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

    <h3>8 — Use key on door (inventory item script)</h3>
    <p>Create the item in <strong>Inventory</strong>, then <strong>Scripts</strong> → Scope <strong>Inventory</strong> → Target <em>brass_key</em> → Event <em>onUseWith</em> → <strong>Create Script</strong>.</p>
    <pre class="docs-code"><code>function on_use_with(targetType, targetId, x, y) {
  if (targetType !== "hotspot" || targetId !== "door_exit") return false;
  remove_from_inventory("brass_key", 1);
  enableHotspot("door_exit");
  show_message("The door unlocks.");
  return true;
}</code></pre>

    <h3>9 — Door hotspot (usedItemId fallback)</h3>
    <pre class="docs-code"><code>function on_hotspot_click(hotspot_id, x, y, usedItemId) {
  if (hotspot_id !== "door_exit") return;
  if (usedItemId === "brass_key") {
    remove_from_inventory("brass_key", 1);
    load_room("garden", 400, 300, 2);
    return true;
  }
  if (!usedItemId) {
    show_message("The door is locked.");
    return;
  }
  return false;
}</code></pre>

    <h3>10 — Combine two inventory items</h3>
    <pre class="docs-code"><code>// Script on item "rope"
function on_use_with(targetType, targetId) {
  if (targetType !== "inventory" || targetId !== "metal_hook") return false;
  remove_from_inventory("rope", 1);
  remove_from_inventory("metal_hook", 1);
  add_to_inventory("grappling_hook", 1);
  show_message("You tie the rope to the hook.");
  return true;
}</code></pre>

    <h3>11 — Puzzle with variables</h3>
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

  <section id="doc-projects" class="docs-section">
    <h2>Projects &amp; saving</h2>
    <h3><code>.amnt</code> file format</h3>
    <p>A project is stored as a single <strong><code>.amnt</code></strong> file: JSON containing the project structure plus embedded assets (images/sounds as base64). One file = one game project, easy to back up and share.</p>
    <ul>
      <li><strong>Create</strong> — Projects tab → new name → choose where to save the <code>.amnt</code> file (native dialog in the desktop app).</li>
      <li><strong>Save Project</strong> — header button (top right) updates the linked file.</li>
      <li><strong>Project Settings</strong> — header button next to Save; canvas size, name, author, etc.</li>
      <li><strong>Load Project</strong> — open an existing <code>.amnt</code> or legacy <code>.json</code> file.</li>
      <li><strong>Export</strong> — export full <code>.amnt</code> bundle from the Projects tab when needed.</li>
      <li><strong>Export Game (HTML)</strong> — Projects tab: one self-contained <code>.html</code> file (runtime + assets) playable in any modern browser without the editor. Press <kbd>L</kbd> for the runtime log.</li>
    </ul>
    <p>Assets are also cached in <strong>IndexedDB</strong> for fast editing. Legacy <code>.json</code> projects (without embedded assets) are still supported for import.</p>
    <h3>Desktop app</h3>
    <p>Run <code>npm start</code> for the Electron editor, or <code>npm run dist</code> to build a Windows installer. No internet connection required.</p>
  </section>

  <section id="doc-playtest" class="docs-section">
    <h2>Play test &amp; export</h2>
    <ul>
      <li><strong>Start Test</strong> — embedded canvas + script sandbox; full window opens <code>runtime.html</code>.</li>
      <li><strong>Script console</strong> — shows <code>print</code> / errors from sandbox.</li>
      <li><strong>Export Game (HTML)</strong> — single-file game player from the Projects tab (no editor required).</li>
      <li><strong>Export .amnt</strong> — project bundle for editing / backup.</li>
      <li>Standalone runtime: load <code>.amnt</code> / JSON file or last saved; same script API as Play Test.</li>
    </ul>
    <p>In-editor scripts run in <code>runtime-sandbox.html</code> (hidden iframe, <code>allow-scripts allow-same-origin</code>). Scripts cannot access the parent DOM; only the exposed game API.</p>
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
      <li>Branching dialogues: use the <strong>Dialogues</strong> tab (Form or Visual). <code>start_dialogue</code> supports conditions, once-only, jump/action, portraits/mood. See <code>docs/DIALOGUE_VISUAL_EDITOR.md</code>.</li>
      <li>Game saves: use GUI type <strong>SaveLoad</strong> (drawable slots) + <code>show_gui</code> / <code>hide_gui</code>, or call <code>save_game</code> / <code>load_game</code> from scripts. Fade transitions still on the roadmap.</li>
      <li>Editor header autosave: Saved to disk / Saved to cache / Unsaved / Autosaving… / Disk save failed (cache OK).</li>
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
