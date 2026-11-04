Penguin Logistics - LearnCraft bridge
=====================================

Deployment version note
  This release is version 1.1.0. Chrome may not automatically update an existing
  installation whose version is higher.

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


Version 1.4.0
  Adds the Ultimate Go Live extension popup. It lists open Master Canvas tabs,
  previews the next step, runs the confirmed workflow, shows progress, and can
  close variant tabs that finish successfully. The web app is no longer needed
  to start a run. Reload the extension from chrome://extensions after updating.

Version 1.4.1
  Fixes the web Preview activating the Master Canvas tab. Preview no longer
  switches tabs. Update the extension and reload it from chrome://extensions.

Version 1.4.2
  Reports the Master Canvas status to the web app. Go Live is disabled when
  the Master is already Ready. Update the extension and reload it from
  chrome://extensions.

Version 1.4.3
  Removes the Preview button from the Ultimate Go Live popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.4
  Removes the active/open tab label from the Ultimate Go Live popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.5
  Removes the duplicate course code line from the Ultimate Go Live popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.6
  Puts courses that can Go Live at the top of the Ultimate Go Live popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.7
  Matches the popup Go Live button colors to the web tool.
  Update the extension and reload it from chrome://extensions.

Version 1.4.8
  Adds the shared Penguin Logistics logo to the Ultimate Go Live popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.9
  Uses the same Penguin Logistics logo asset in the web app and extension popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.10
  Shows "Ready to Go Live" for eligible courses in the popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.11
  Detects course codes with alphabetic prefixes, including EC9203 and P2030.
  Update the extension and reload it from chrome://extensions.

Version 1.4.12
  Handles the Master Canvas Alert stage by selecting its red Update button.
  Update the extension and reload it from chrome://extensions.

Version 1.4.13
  Confirms the "Update this Master Canvas ?" dialog after updating an alert Master Canvas.
  Update the extension and reload it from chrome://extensions.

Version 1.4.14
  Shows the number of linked variants in each Master Canvas status chip.
  Update the extension and reload it from chrome://extensions.

Version 1.4.15
  Adds a Copy log button to the popup and keeps the Run log expanded as progress updates.
  Update the extension and reload it from chrome://extensions.

Version 1.4.16
  Lets you choose which linked variants to update from the web app or popup; all are selected by default.
  Update the extension and reload it from chrome://extensions.

Version 1.4.17
  Places Choose variants beside Go Live in the web app and popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.23
  Updates the extension icon and popup branding for Loy Krathong.
  Update the extension and reload it from chrome://extensions.

Version 1.4.22
  Go Live from the web app stays on the page instead of switching to the selected Master Canvas tab.
  Update the extension and reload it from chrome://extensions.

Version 1.4.21
  Shows a RUN badge and current course/step in the extension icon tooltip while Go Live is running from the popup.
  Update the extension and reload it from chrome://extensions.

Version 1.4.20
  Remembers the Close variant tabs when they are ready option when the popup is reopened or refreshed.
  Update the extension and reload it from chrome://extensions.

Version 1.4.19
  The popup restores the current run status after it is closed and reopened. Press Refresh to clear it.
  Update the extension and reload it from chrome://extensions.

Version 1.4.18
  Matches the Choose variants button height to Go Live in the popup and web app.
  Update the extension and reload it from chrome://extensions.

Version 1.3.1
  Fixes the page showing "Extension v1.2.9 is too old" again and again after an update: the extension now
  reports its id, and a copy that was reloaded or removed while the page stayed open stays silent. The
  page now tells you when more than one copy is installed and will not start a run until only one is left.
  Update this extension to 1.3.1 and press reload on its card in chrome://extensions.

Version 1.3.0
  Ultimate Go Live shows each variant's progress on its own row and tells the page when a variant has
  finished. A page that is reloading no longer ends a run: the step is looked at again (without clicking)
  up to three times. New option: close the tabs of variants that finished OK (off by default).
  The summary now includes how long the run took.
  Update this extension to 1.3.0 and press reload on its card in chrome://extensions.

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
