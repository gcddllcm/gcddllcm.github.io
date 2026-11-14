Penguin Logistics - LearnCraft bridge
=====================================

Deployment version note
  The extension package in this repository is version 1.3.1, matching manifest.json.
  The web tools require extension version 1.3.0 or later. The Version 1.3.1 entry describes
  this package. Release-history sections below are clearly labeled as earlier
  changes included in this release or later archived releases. Chrome
  may not automatically update an existing installation whose version is higher.

Version 1.3.1
  Matched the popup background to the website with solid colors in dark and light
  themes, removing the background gradients. Reported the extension ID to prevent
  stale-version warnings and detected duplicate installs.

Version 1.3.0
  Rolls up the extension improvements from 1.2.1 through 1.2.10. Ultimate Go Live
  now finishes correctly when a Master has no variants, reports page status when
  a run stops, and waits for LearnCraft dialogs and disabled confirmation buttons
  to become ready instead of repeating clicks. It handles approval, update, and
  Submit as Ready confirmations more reliably, with clear timeout details.
  Linked variants are processed in parallel in background tabs, with per-variant
  progress, safe retries after page reloads, an optional setting to close
  successfully finished tabs, and a run-duration summary.
  Timestamp Maker identifies assets by their order within a subsection, so
  multiple assets with identical names can be filled safely.
  Update this extension to 1.3.0 or later before using the updated tools.

What it does
  Lets the Ultimate Go Live popup work directly with your open LearnCraft Master
  Canvas tabs. The Penguin Logistics page can also list LearnCraft tabs, read
  course structure, and fill timestamp fields in the tab you pick. It only touches
  https://craft.learn.co.th/* tabs. Nothing is sent over the internet.

Install (Chrome, one time)
  1. Download the extension file.
  2. Open the Chrome extensions page: copy chrome://extensions into your browser
     address bar and press Enter.
  3. Turn on "Developer mode".
  4. Drag and drop the downloaded ZIP onto the extensions page. Do not extract it.
  5. Come back to Penguin Logistics and press "Force refresh".

Included features
  Eggspace courses are recognised, and collapsed parts, sections and subsections
  are opened automatically while the course is read (this can take a few minutes
  on a long course). You no longer need to open them by hand.
  Click the extension icon while LearnCraft is open to preview or take a Master
  Canvas and its variants to Ready. The popup shows progress and asks you to
  confirm before it starts clicking. It never clicks LearnCraft's Go live button.
  Timestamp Maker lists the assets in a Master Canvas and fills Page no. / Pb no.
  in each asset's Video overlay timestamp. Selected assets in the same subsection
  are filled and saved together, then verified before moving to the next
  subsection; assets outside subsections are handled individually. The Master
  Canvas itself is not saved by the tool. A Stop button ends the run after the
  current asset group has been saved and verified. When all selected assets have
  been processed, the browser returns to the Timestamp Maker tab and scrolls
  the final result into view.
  If LearnCraft shows an error dialog with a Refresh button during timestamp
  entry, the tool presses Refresh and resumes waiting for the current step.

Update
  Download the extension again, replace the old folder, then press the
  reload button on its card in chrome://extensions.
  Dropping a new ZIP installs a SECOND copy and leaves the old one running. Before you drop it,
  press Remove on every old "Penguin Logistics - LearnCraft bridge" card in chrome://extensions,
  so that only one copy is left. The page warns you when more than one copy is installed.

Using your own address
  For your safety the bridge only runs on one address: https://gcddllcm.github.io
  (plus localhost / 127.0.0.1 for testing). No other website can talk to this
  extension. If Penguin Logistics is on another address (for example a custom
  domain), add it in TWO places, then reload the extension:
    1. manifest.json  ->  "matches"   (for example "https://example.com/*")
    2. background.js  ->  ALLOWED_ORIGINS  (the line near the top of the file)
  and keep <meta name="penguin-logistics"> in index.html.


Earlier release notes incorporated into v1.3.1
----------------------------------------------
Version 1.2.9
  After the Master is ready, Ultimate Go Live opens each linked variant in its
  own background tab and processes all variants in parallel. It does not activate
  those tabs, so the Penguin Logistics page remains in front. The created tabs
  are left open when the run finishes for inspection.
  Update this extension to 1.2.9 and press reload on its card in chrome://extensions.

Version 1.2.8
  Ultimate Go Live waits when the Submit for Ready confirmation is disabled,
  then continues when the variant reaches the next stage.
  Update this extension to 1.2.8 and press reload on its card in chrome://extensions.

Version 1.2.7
  Ultimate Go Live waits when the variant Update confirmation is temporarily
  disabled, then continues with the next stage (including Submit as Ready).
  Update this extension to 1.2.7 and press reload on its card in chrome://extensions.

Version 1.2.6
  Ultimate Go Live waits up to 60 seconds after each click for LearnCraft to
  move on, without repeating the same click. The "Confirm Approval ?" dialog
  also waits for its Submit button to become enabled.
  Update this extension to 1.2.6 and press reload on its card in chrome://extensions.

Version 1.2.5
  Ultimate Go Live now submits the "Confirm Approval ?" dialog when the Master
  Canvas is in approving status.
  Update this extension to 1.2.5 and press reload on its card in chrome://extensions.

Version 1.2.4
  After the timestamp dialog's Submit action, if the Master Canvas is approving
  while the dialog remains visible, Ultimate Go Live clicks the enabled green
  Approve button on the Master instead of retrying Submit.
  Update this extension to 1.2.4 and press reload on its card in chrome://extensions.

Version 1.2.3
  Ultimate Go Live now waits for the timestamp dialog to close or offer an
  enabled Approve or Submit button after Ignore is confirmed. If it remains
  open without an enabled confirmation for 25 seconds, the run stops with details.
  Update this extension to 1.2.3 and press reload on its card in chrome://extensions.

Version 1.2.2
  Ultimate Go Live now waits for LearnCraft to finish processing when the
  timestamp dialog's confirmation button becomes disabled after Ignore is ticked.
  If it stays disabled for 25 seconds, the run stops with a specific message.
  Update this extension to 1.2.2 and press reload on its card in chrome://extensions.

Version 1.2.1
  Ultimate Go Live: a course whose Master Canvas has no variants now finishes as soon as the
  master is ready (it used to stop). When a run stops, the message lists the status labels and
  buttons the page was showing, so the cause is visible in the log.
  Update this extension to 1.2.1 and press reload on its card in chrome://extensions.

Version 1.2.0: LearnCraft : Ultimate Go Live
  Adds the "LearnCraft : Ultimate Go Live" tool. From an open Master Canvas tab it
  approves the master, then updates every variant until each one is ready. It only
  clicks the steps it knows (Submit for Approval, Approve, Update, Submit as Ready and
  the matching confirmations). It never clicks Go live. Use "Preview" first to see
  what it would do without clicking anything. If a page is unexpected, it stops and
  says why. If an "Assets without timestamp" dialog appears, the tool automatically ticks
  "Ignore Asset without Timestamp", then confirms with Approve or Submit and continues.
  Update this extension to 1.2.0 or later before using the tool.

Archived notes for later releases (not included in the v1.3.1 package)
----------------------------------------------------------------------
These entries document separate, later release lines. They are kept for reference
only; the package described at the top of this README is v1.3.1.

Version 1.4.23
  Updated the extension icon and popup branding for Loy Krathong.

Version 1.4.22
  Kept Go Live on the web app page instead of switching to the selected Master tab.

Version 1.4.21
  Added a RUN badge and current course/step to the extension icon tooltip.

Version 1.4.20
  Remembered the Close variant tabs setting when reopening the popup.

Version 1.4.19
  Restored run status when reopening the popup, with Refresh to clear it.

Version 1.4.18
  Matched the Choose variants button height in the popup and web app.

Version 1.4.17
  Placed Choose variants beside Go Live in the web app and popup.

Version 1.4.16
  Added variant selection in the web app and popup; all variants default to selected.

Version 1.4.15
  Added Copy log and kept the Run log expanded as progress updates.

Version 1.4.14
  Added linked-variant counts to Master Canvas status chips.

Version 1.4.13
  Confirmed the alert update dialog after updating a Master Canvas.

Version 1.4.12
  Handled the Master Canvas Alert stage by selecting its red Update button.

Version 1.4.11
  Detected course codes with alphabetic prefixes, including EC9203 and P2030.

Version 1.4.10
  Showed "Ready to Go Live" for eligible courses in the popup.

Version 1.4.9
  Reused the Penguin Logistics logo asset in the web app and popup.

Version 1.4.8
  Added the shared Penguin Logistics logo to the popup.

Version 1.4.7
  Matched the popup Go Live button colors to the web tool.

Version 1.4.6
  Put courses that can Go Live at the top of the popup.

Version 1.4.5
  Removed the duplicate course code line from the popup.

Version 1.4.4
  Removed the active/open tab label from the popup.

Version 1.4.3
  Removed the Preview button from the popup.

Version 1.4.2
  Reported Master Canvas status to the web app and disabled Go Live when already Ready.

Version 1.4.1
  Fixed web Preview so it no longer activates the Master Canvas tab.

Version 1.4.0
  Added the Go Live popup with tab listing, preview, progress, and optional
  successful-tab closing.
